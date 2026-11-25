begin;

-- Existing deals retain their recorded completion and legacy document behavior.
alter table public.deals
  add column application_review_required boolean not null default false,
  add column application_reviewed_at timestamptz;
alter table public.deals alter column application_review_required set default true;

create or replace function public.crm_sales_deal_evidence()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  d public.deals%rowtype;
  event_kind text;
  event_at timestamptz := now();
  event_stage text;
  event_funder text;
  coarse_stage_changed boolean := false;
begin
  if tg_table_name = 'deals' then
    d := new;
    coarse_stage_changed := old.current_stage is distinct from new.current_stage;
    if coarse_stage_changed then
      insert into public.crm_sales_events(deal_id,kind,actor_id,origin_id,assigned_id,closer_id,processor_id,stage)
      values(d.id,'stage_changed',auth.uid(),coalesce(d.owner_profile_id,d.assigned_rep_id),
        d.assigned_rep_id,d.closer_rep_id,d.sales_processor_id,d.current_stage::text);
    end if;
    if d.current_stage::text = 'Funded' and (coarse_stage_changed or old.funded_date is distinct from new.funded_date) then
      event_kind := 'funded';
      if d.funded_date is not null and d.funded_date <> (now() at time zone 'America/Los_Angeles')::date then
        event_at := d.funded_date::timestamp at time zone 'America/Los_Angeles';
      end if;
    end if;
  else
    select * into d from public.deals where id = new.deal_id for no key update;
    if not found then return new; end if;
    if tg_table_name = 'deal_files' and not d.application_review_required and exists (
      select 1 from public.deal_files where deal_id = d.id and file_type = 'application'
    ) and exists (select 1 from public.deal_files where deal_id = d.id and file_type = 'statement') then
      event_kind := 'application_completed';
    elsif tg_table_name = 'offers' then
      insert into public.crm_sales_events(deal_id,kind,actor_id,origin_id,assigned_id,closer_id,processor_id,stage,funder,note)
      values(d.id,'offer_response',auth.uid(),coalesce(d.owner_profile_id,d.assigned_rep_id),
        d.assigned_rep_id,d.closer_rep_id,d.sales_processor_id,d.current_stage::text,new.funder,
        jsonb_strip_nulls(jsonb_build_object('status',new.status,'amount',new.approval_amount,
          'factor',new.factor_rate,'payment',new.payment_amount,'frequency',new.payment_frequency,
          'term',new.term,'term_payments',new.term_payments,'decline_reason',new.decline_reason,'stipulations',new.stipulations))::text);
      if new.status::text in ('open','accepted','expired') and new.decision is distinct from 'decline' and new.approval_amount > 0 then
        event_kind := 'approved';
        event_funder := new.funder;
      end if;
    end if;
  end if;
  if event_kind is null then return new; end if;
  if event_kind = 'approved' and not d.sales_lost
    and d.current_stage::text not in ('Funded','Killed','KIF','Contracts Requested','Contracts Signed','Contracts Out')
    and (d.sales_stage is null or d.sales_stage in ('processing','submitted','underwriting','stipulations')) then
    update public.deals set sales_stage = 'approved' where id = d.id;
  end if;
  if exists (select 1 from public.crm_sales_events where deal_id = d.id and kind = event_kind) then return new; end if;
  event_stage := case when event_kind = 'approved' then 'approved' else coalesce(d.sales_stage,d.current_stage::text) end;
  insert into public.crm_sales_events(deal_id,kind,occurred_at,actor_id,origin_id,assigned_id,closer_id,processor_id,stage,funder,date_only)
  values(d.id,event_kind,event_at,auth.uid(),coalesce(d.owner_profile_id,d.assigned_rep_id),
    d.assigned_rep_id,d.closer_rep_id,d.sales_processor_id,event_stage,event_funder,
    event_kind = 'funded' and event_at <> now());
  return new;
end;
$$;

create or replace view public.crm_sales_deal_queue with (security_invoker = true) as
select d.id,d.business_name,d.current_stage,d.assigned_rep_id,d.owner_profile_id,d.closer_rep_id,
  d.sales_processor_id,d.sales_test,d.sales_lost,d.sales_source,d.sales_follow_up_at,d.sales_next_action,
  d.submitted_at,d.funded_date,d.funded_amount,d.gross_commission,d.converted_from_hot_lead_id,
  d.sales_stage,
  case
    when d.current_stage::text = 'Funded' then 'funded'
    when d.sales_lost or d.current_stage::text in ('Killed','KIF') then 'lost'
    when d.application_review_required and d.application_reviewed_at is null then 'missing_documents'
    when d.sales_stage in ('contracts_signed','final_conditions') then d.sales_stage
    when d.current_stage::text = 'Contracts Requested' then
      case when d.sales_stage = 'contracts_out' then 'contracts_out' else 'contract_requested' end
    when d.current_stage::text in ('Contracts Signed','Contracts Out') then
      case when d.current_stage::text = 'Contracts Signed' then 'contracts_signed' else 'contracts_out' end
    when d.sales_stage is not null then d.sales_stage
    when coalesce(f.application,false) = false or coalesce(f.statement,false) = false then 'missing_documents'
    when exists (select 1 from public.crm_sales_events e where e.deal_id=d.id and e.kind='approved') then 'approved'
    when d.current_stage::text in ('Offers / Declines Received','Offers','Deal Pitched') then 'underwriting'
    when d.current_stage::text in ('Application Processed','In Underwriting') then 'underwriting'
    else 'processing'
  end as queue_stage,
  coalesce(f.application,false) and coalesce(f.statement,false) as has_documents,
  d.requested_amount, d.archived_at, d.application_review_required, d.application_reviewed_at
from public.deals d
left join lateral (
  select bool_or(file_type='application') as application,bool_or(file_type='statement') as statement
  from public.deal_files where deal_id=d.id
) f on true;

create function public.crm_confirm_application_documents(target_deal_id uuid, months integer, exception_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  d public.deals%rowtype;
  role_name text := public.crm_role();
begin
  if role_name is null or role_name not in ('admin','rep') then raise exception 'Active CRM account required.'; end if;
  select * into d from public.deals where id=target_deal_id for update;
  if not found or d.archived_at is not null or d.sales_lost
    or d.current_stage::text in ('Funded','Killed','KIF')
    or (role_name<>'admin' and d.assigned_rep_id is distinct from auth.uid())
    then raise exception 'Deal is unavailable for document review.'; end if;
  if not d.application_review_required or d.application_reviewed_at is not null then return; end if;
  if months is null or months not between 1 and 24 or length(coalesce(exception_note,''))>500 then
    raise exception 'Enter the number of verified statement months.';
  end if;
  if months<4 and (role_name<>'admin' or nullif(trim(exception_note),'') is null) then
    raise exception 'Four statement months are required unless an admin records an exception.';
  end if;
  if 2 <> (select count(distinct f.file_type) from public.deal_files f
    join storage.objects o on o.bucket_id='deal-files' and o.name=f.path
    where f.deal_id=d.id and f.file_type in ('application','statement')) then
    raise exception 'Attach an application and bank statements before confirming review.';
  end if;
  update public.deals set application_reviewed_at=now() where id=d.id;
  insert into public.crm_sales_events(deal_id,kind,actor_id,origin_id,assigned_id,closer_id,processor_id,stage,note)
  values(d.id,'application_completed',auth.uid(),coalesce(d.owner_profile_id,d.assigned_rep_id),
    d.assigned_rep_id,d.closer_rep_id,d.sales_processor_id,'processing',
    concat_ws(' · ',format('%s statement months verified',months),
      case when months<4 then 'Approved exception: ' || trim(exception_note) end));
end;
$$;
revoke all on function public.crm_confirm_application_documents(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.crm_confirm_application_documents(uuid,integer,text) to authenticated;

commit;
