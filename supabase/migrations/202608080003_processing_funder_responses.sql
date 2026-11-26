begin;

create table public.processing_funder_responses (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  sender text not null,
  subject text not null,
  excerpt text not null,
  proposed_submission uuid references public.funder_submission_logs(id) on delete restrict,
  confidence text not null,
  proposal jsonb not null,
  status text not null default 'review' check (status in ('review','applied','dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  offer_id uuid references public.offers(id) on delete set null,
  final_submission uuid references public.funder_submission_logs(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(provider,external_id)
);
alter table public.processing_funder_responses enable row level security;
revoke all on public.processing_funder_responses from public, anon, authenticated;
grant select on public.processing_funder_responses to authenticated;
grant select,insert,update on public.processing_funder_responses to service_role;
create policy processing_response_admin_read on public.processing_funder_responses for select to authenticated using ((select public.crm_role())='admin');

create or replace function public.crm_review_funder_response(response_id uuid, submission_id uuid, decision text, terms jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  response public.processing_funder_responses%rowtype;
  submission public.funder_submission_logs%rowtype;
  existing_offer uuid;
  principal numeric := (terms->>'amount')::numeric;
  factor numeric := (terms->>'factor')::numeric;
  payback numeric := (terms->>'payback')::numeric;
  payment numeric := (terms->>'payment')::numeric;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  select * into response from public.processing_funder_responses where id=response_id for update;
  if not found then raise exception 'Response unavailable.'; end if;
  if response.status<>'review' then return; end if;
  if decision='dismiss' then
    update public.processing_funder_responses set status='dismissed',reviewed_at=now(),reviewed_by=auth.uid() where id=response_id;
    return;
  end if;
  if decision is null or decision not in ('approval','decline') then raise exception 'Only approvals or declines can update the tracker.'; end if;
  if decision='approval' and (
    not coalesce(principal between 0.01 and 9999999999.99,false)
    or not coalesce(factor between 1 and 100,true) or not coalesce(payback>=principal,true)
    or not coalesce(payment>=0,true)
    or (factor is not null and payback is not null and abs(principal*factor-payback)>1)
  ) then raise exception 'Check the amount, factor, payment, and total payback.'; end if;
  if decision='decline' and nullif(trim(terms->>'declineReason'),'') is null then raise exception 'Enter the recorded decline reason.'; end if;
  select * into submission from public.funder_submission_logs where id=submission_id and status='sent';
  if not found then raise exception 'Select a confirmed submission.'; end if;
  perform id from public.deals where id=submission.deal_id and archived_at is null and not sales_lost
    and current_stage::text not in ('Funded','Killed','KIF') for update;
  if not found then raise exception 'This deal is closed to offer updates.'; end if;

  select o.id into existing_offer from public.offers o
  where o.deal_id=submission.deal_id and lower(o.funder)=lower(submission.funder_name) and o.decision=$3
    and o.approval_amount=(case when $3='approval' then principal else 0 end)
    and o.factor_rate is not distinct from factor and o.total_payback is not distinct from payback
    and o.payment_amount is not distinct from payment and o.payment_frequency is not distinct from (terms->>'frequency')
    and o.term is not distinct from (terms->>'term') and o.stipulations is not distinct from (terms->>'stipulations')
    and o.expiration_date is not distinct from (terms->>'expiration')::date
    and o.decline_reason is not distinct from (terms->>'declineReason')
  order by o.created_at desc limit 1;
  if existing_offer is null then
    insert into public.offers(deal_id,funder,status,decision,approval_amount,factor_rate,total_payback,
      payment_amount,payment_frequency,term,stipulations,expiration_date,decline_reason)
    values(submission.deal_id,submission.funder_name,
      (case when decision='approval' then 'open' else 'declined' end)::public.offer_status,
      decision,case when decision='approval' then principal else 0 end,factor,payback,payment,terms->>'frequency',
      terms->>'term',terms->>'stipulations',(terms->>'expiration')::date,terms->>'declineReason')
    returning id into existing_offer;
  end if;
  update public.processing_funder_responses set status='applied',reviewed_at=now(),reviewed_by=auth.uid(),
    offer_id=existing_offer,final_submission=submission.id where id=response_id;
end;
$$;
revoke all on function public.crm_review_funder_response(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.crm_review_funder_response(uuid,uuid,text,jsonb) to authenticated;

commit;
