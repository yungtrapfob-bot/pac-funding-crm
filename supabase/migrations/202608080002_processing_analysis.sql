begin;

create table public.processing_document_analyses (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  provider text not null,
  version text not null,
  input_key text not null,
  document_ids uuid[] not null,
  status text not null check (status in ('analyzing','needs_review','complete','failed')),
  summary jsonb,
  review_inputs jsonb,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index processing_analysis_active on public.processing_document_analyses(deal_id) where status='analyzing';
create index processing_analysis_history on public.processing_document_analyses(deal_id, created_at desc);

create table public.processing_underwriting (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  average_daily_balance numeric(14,2),
  negative_days integer check (negative_days between 0 and 31),
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now()
);
alter table public.processing_document_analyses enable row level security;
alter table public.processing_underwriting enable row level security;
revoke all on public.processing_document_analyses,public.processing_underwriting from public, anon, authenticated;
grant select on public.processing_document_analyses,public.processing_underwriting to authenticated;
grant select,insert,update on public.processing_document_analyses,public.processing_underwriting to service_role;
create policy processing_analysis_admin_read on public.processing_document_analyses for select to authenticated using ((select public.crm_role())='admin');
create policy processing_underwriting_admin_read on public.processing_underwriting for select to authenticated using ((select public.crm_role())='admin');

create function public.crm_save_processing_underwriting(target_deal uuid, analysis_id uuid, inputs jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  perform id from public.deals
    where id=target_deal and archived_at is null and not sales_lost
      and current_stage::text not in ('Funded','Killed','KIF') for update;
  if not found then raise exception 'The deal is closed or unavailable for underwriting.'; end if;
  if analysis_id is not null then
    update public.processing_document_analyses set status='complete',reviewed_by=actor,
      reviewed_at=now(),review_inputs=inputs where id=analysis_id and deal_id=target_deal
      and status='needs_review' and coalesce(jsonb_array_length(summary->'months'),0)>0;
    if not found then raise exception 'Analysis is unavailable or has no usable statement evidence.'; end if;
  end if;
  if length(coalesce(inputs->>'industry',''))>100 or coalesce(inputs->>'state','CA') !~ '^[A-Z]{2}$'
    or not coalesce((inputs->>'fico')::int between 300 and 850,true)
    or not coalesce((inputs->>'positions')::int between 0 and 100,true)
    or not coalesce((inputs->>'nsfs')::int between 0 and 10000,true)
    or not coalesce((inputs->>'deposits')::int between 0 and 10000,true)
    or not coalesce((inputs->>'months')::int between 0 and 1200,true)
    or not coalesce((inputs->>'revenue')::numeric between 0 and 9999999999.99,true)
    or not coalesce((inputs->>'requested')::numeric between 0 and 9999999999.99,true) then
    raise exception 'Check the underwriting values.';
  end if;
  update public.deals set monthly_revenue=(inputs->>'revenue')::numeric,
    requested_amount=(inputs->>'requested')::numeric, industry=inputs->>'industry',state=inputs->>'state',
    time_in_business_months=(inputs->>'months')::int,positions=(inputs->>'positions')::int,
    fico=(inputs->>'fico')::int,nsf_count=(inputs->>'nsfs')::int,deposits=(inputs->>'deposits')::int
    where id=target_deal;
  insert into public.processing_underwriting(deal_id,average_daily_balance,negative_days,reviewed_by)
    values(target_deal,(inputs->>'balance')::numeric,(inputs->>'negativeDays')::int,actor)
    on conflict (deal_id) do update set average_daily_balance=excluded.average_daily_balance,
      negative_days=excluded.negative_days,reviewed_by=excluded.reviewed_by,reviewed_at=now();
end;
$$;
revoke all on function public.crm_save_processing_underwriting(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.crm_save_processing_underwriting(uuid,uuid,jsonb) to authenticated;

commit;
