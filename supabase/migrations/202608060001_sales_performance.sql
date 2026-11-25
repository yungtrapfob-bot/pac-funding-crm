begin;
set local lock_timeout = '5s';

alter table public.hot_leads
  add column converted_at timestamptz,
  add column sales_review boolean not null default false,
  add column sales_stage text not null default 'interested' check (sales_stage in ('interested','application_requested','waiting_application','waiting_statements','partial_application')),
  add column sales_source text,
  add column sales_lost boolean not null default false,
  add column sales_test boolean not null default false;
alter table public.deals
  add column if not exists requested_amount numeric(12,2),
  add column sales_stage text check (sales_stage in ('processing','submitted','underwriting','stipulations','approved','pitched','considering','contract_requested','contracts_out','contracts_signed','final_conditions')),
  add column sales_source text,
  add column sales_lost boolean not null default false,
  add column sales_test boolean not null default false,
  add column sales_next_action text,
  add column sales_follow_up_at timestamptz,
  add column sales_processor_id uuid references public.profiles(id);
grant insert (requested_amount) on public.deals to authenticated;

-- Preserve all links and original dates. Activity without a deal link is
-- deliberately left for review. No matching by merchant name.
with evidence as (
  select converted_from_hot_lead_id as lead_id, submitted_at as occurred_at
  from public.deals where converted_from_hot_lead_id is not null
  union all
  select a.hot_lead_id, a.created_at from public.activities a
  join public.deals d on d.id = a.deal_id
  where a.hot_lead_id is not null and a.activity_type = 'hot_lead_converted'
), first_conversion as (
  select lead_id, min(occurred_at) as occurred_at from evidence group by lead_id
)
update public.hot_leads l set converted_at = f.occurred_at
from first_conversion f where f.lead_id = l.id;

update public.hot_leads l set sales_review = true
where l.converted_at is null and (
  exists (select 1 from public.activities a where a.hot_lead_id=l.id and a.activity_type='hot_lead_converted')
  or lower(trim(coalesce(l.outcome_tag,''))) in ('converted','conversion','deal created')
);

-- Honor explicit terminal legacy tags for current inventory only. These
-- fields have no reliable loss timestamp, so they do not seed loss events.
update public.hot_leads set sales_lost=true
where converted_at is null and lower(trim(coalesce(outcome_tag,''))) in
  ('lost','ghosted','merchant ghosted','merchant no longer interested','lost to competing offer');
create index crm_sales_active_leads on public.hot_leads(assigned_rep_id,next_follow_up_date)
where archived_at is null and converted_at is null and not sales_lost and not sales_review;
create index crm_sales_deal_followups on public.deals(assigned_rep_id,sales_follow_up_at)
where sales_follow_up_at is not null and not sales_lost;

create table public.crm_sales_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.hot_leads(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete restrict,
  kind text not null check (kind in ('lead_created','application_requested','partial_application','converted',
    'application_completed','submitted','approved','pitched','contracts_out','contracts_signed',
    'funded','lost','reopened','call','text','email','note','offer_response','task_completed','task_scheduled','stage_changed')),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  origin_id uuid references public.profiles(id),
  assigned_id uuid references public.profiles(id),
  closer_id uuid references public.profiles(id),
  processor_id uuid references public.profiles(id),
  stage text,
  reason text,
  note text,
  funder text,
  date_only boolean not null default false,
  evidence text not null default 'recorded',
  check (num_nonnulls(lead_id,deal_id) = 1)
);
create index crm_sales_events_lead on public.crm_sales_events(lead_id,occurred_at);
create index crm_sales_events_deal on public.crm_sales_events(deal_id,occurred_at);
create index crm_sales_events_kind on public.crm_sales_events(kind,occurred_at);
alter table public.crm_sales_events enable row level security;
revoke all on public.crm_sales_events from public, anon, authenticated;
grant select on public.crm_sales_events to authenticated;
create policy crm_sales_events_read on public.crm_sales_events for select to authenticated using (
  (select public.crm_role()) in ('admin','rep') and (
    exists (select 1 from public.hot_leads l where l.id = lead_id)
    or exists (select 1 from public.deals d where d.id = deal_id)
  )
);

-- History is reconstructed only from records with evidence of that milestone.
insert into public.crm_sales_events (lead_id,kind,occurred_at,origin_id,assigned_id,stage,evidence)
select id,'lead_created',created_at,coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id,'interested','lead_created_at'
from public.hot_leads;
insert into public.crm_sales_events (lead_id,kind,occurred_at,origin_id,assigned_id,evidence)
select id,'converted',converted_at,coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id,'verified_deal_link'
from public.hot_leads where converted_at is not null;
with docs as (
  select deal_id, greatest(
    min(created_at) filter (where file_type = 'application'),
    min(created_at) filter (where file_type = 'statement')
  ) as occurred_at
  from public.deal_files group by deal_id
  having bool_or(file_type = 'application') and bool_or(file_type = 'statement')
)
insert into public.crm_sales_events (deal_id,kind,occurred_at,origin_id,assigned_id,closer_id,evidence)
select d.id,'application_completed',s.occurred_at,coalesce(d.owner_profile_id,d.assigned_rep_id),d.assigned_rep_id,d.closer_rep_id,'document_metadata'
from docs s join public.deals d on d.id = s.deal_id;
insert into public.crm_sales_events (deal_id,kind,occurred_at,origin_id,assigned_id,closer_id,evidence)
select d.id,'approved',a.approved_at,coalesce(d.owner_profile_id,d.assigned_rep_id),d.assigned_rep_id,d.closer_rep_id,'qualifying_offer_created'
from public.deals d join (
  select deal_id,min(created_at) as approved_at from public.offers
  where status::text in ('open','accepted','expired') and decision is distinct from 'decline' and approval_amount > 0
  group by deal_id
) a on a.deal_id = d.id;
insert into public.crm_sales_events (deal_id,kind,occurred_at,actor_id,origin_id,assigned_id,closer_id,funder,evidence)
select d.id,'submitted',s.submitted_at,s.submitted_by,coalesce(d.owner_profile_id,d.assigned_rep_id),d.assigned_rep_id,d.closer_rep_id,s.funder_name,'sent_submission_log'
from public.funder_submission_logs s join public.deals d on d.id = s.deal_id
where s.status::text = 'sent';
insert into public.crm_sales_events (deal_id,kind,occurred_at,origin_id,assigned_id,closer_id,date_only,evidence)
select id,'funded',funded_date::timestamp at time zone 'America/Los_Angeles',
  coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id,closer_rep_id,true,'funded_date'
from public.deals where current_stage::text = 'Funded' and funded_date is not null;
insert into public.crm_sales_events (deal_id,kind,occurred_at,origin_id,assigned_id,closer_id,date_only,evidence)
select id,'contracts_out',contracts_sent_date::timestamp at time zone 'America/Los_Angeles',
  coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id,closer_rep_id,true,'contracts_sent_date'
from public.deals where contracts_sent_date is not null;

-- Extend the existing lock and authorization boundary without changing the intake grants.
create or replace function public.crm_guard_conversion()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare lead public.hot_leads%rowtype;
begin
  if new.converted_from_hot_lead_id is null then return new; end if;
  select * into lead from public.hot_leads where id = new.converted_from_hot_lead_id for update;
  if not found or lead.archived_at is not null or lead.sales_lost or lead.sales_review
    or new.assigned_rep_id is distinct from lead.assigned_rep_id
    or (auth.uid() is not null and public.crm_role() is distinct from 'admin'
        and lead.assigned_rep_id is distinct from auth.uid()) then
    raise exception 'Lead is unavailable for conversion.';
  end if;
  if lead.converted_at is not null
    or exists (select 1 from public.deals where converted_from_hot_lead_id = lead.id)
    or exists (select 1 from public.activities where hot_lead_id = lead.id
      and activity_type = 'hot_lead_converted' and deal_id is not null) then
    raise exception 'This lead already has a deal.';
  end if;
  new.owner_profile_id := coalesce(lead.owner_profile_id, lead.assigned_rep_id);
  new.requested_amount := coalesce(new.requested_amount, nullif(lead.requested_amount,0));
  new.sales_source := lead.sales_source;
  new.sales_test := lead.sales_test;
  return new;
end;
$$;
revoke all on function public.crm_guard_conversion() from public, anon, authenticated;

create function public.crm_sales_keep_conversion_link()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null and new.converted_from_hot_lead_id is distinct from old.converted_from_hot_lead_id then
    raise exception 'Originating lead links are immutable in the CRM.';
  end if;
  return new;
end;
$$;
revoke all on function public.crm_sales_keep_conversion_link() from public, anon, authenticated;
create trigger crm_sales_keep_conversion_link before update of converted_from_hot_lead_id on public.deals
for each row execute function public.crm_sales_keep_conversion_link();

create function public.crm_sales_lead_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.crm_sales_events(lead_id,kind,occurred_at,actor_id,origin_id,assigned_id,stage)
  values(new.id,'lead_created',new.created_at,auth.uid(),coalesce(new.owner_profile_id,new.assigned_rep_id),
    new.assigned_rep_id,new.sales_stage);
  return new;
end;
$$;
revoke all on function public.crm_sales_lead_created() from public, anon, authenticated;
create trigger crm_sales_lead_created after insert on public.hot_leads
for each row execute function public.crm_sales_lead_created();

create function public.crm_sales_converted()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare previous_due timestamptz;
begin
  if new.converted_from_hot_lead_id is null then return new; end if;
  select next_follow_up_date into previous_due from public.hot_leads where id = new.converted_from_hot_lead_id;
  update public.hot_leads set converted_at = new.submitted_at, next_follow_up_date = null
  where id = new.converted_from_hot_lead_id;
  insert into public.crm_sales_events(lead_id,kind,occurred_at,actor_id,origin_id,assigned_id,stage)
  select id,'converted',new.submitted_at,auth.uid(),new.owner_profile_id,new.assigned_rep_id,sales_stage
  from public.hot_leads where id = new.converted_from_hot_lead_id;
  insert into public.activities(hot_lead_id,deal_id,actor_id,activity_type,details)
  values(new.converted_from_hot_lead_id,new.id,coalesce(auth.uid(),new.assigned_rep_id),'hot_lead_converted',
    jsonb_build_object('closed_prospecting_follow_up',previous_due));
  return new;
end;
$$;
revoke all on function public.crm_sales_converted() from public, anon, authenticated;
create trigger crm_sales_converted after insert on public.deals
for each row execute function public.crm_sales_converted();

create function public.crm_sales_deal_evidence()
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
    if tg_table_name = 'deal_files' and exists (
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
revoke all on function public.crm_sales_deal_evidence() from public, anon, authenticated;
-- File metadata alone cannot create a false completed-application milestone.
-- Existing uploads use Storage first, then save the database reference.
create function public.crm_sales_validate_document_object()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare role_name text;
begin
  if auth.uid() is null or new.file_type not in ('application','statement') then return new; end if;
  role_name := public.crm_role();
  if role_name is null or split_part(new.path,'/',1) is distinct from new.deal_id::text
    or not exists (select 1 from public.deals d where d.id=new.deal_id
      and (role_name='admin' or d.assigned_rep_id=auth.uid())) then
    raise exception 'Deal document is unavailable.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='deal-files' and o.name=new.path) then
    raise exception 'Upload the document to private Storage before recording it.';
  end if;
  return new;
end;
$$;
revoke all on function public.crm_sales_validate_document_object() from public, anon, authenticated;
create trigger crm_sales_validate_document_object before insert on public.deal_files
for each row execute function public.crm_sales_validate_document_object();

create trigger crm_sales_document_evidence after insert on public.deal_files
for each row execute function public.crm_sales_deal_evidence();
create trigger crm_sales_offer_evidence after insert or update of status,decision,approval_amount,factor_rate,payment_amount,payment_frequency,term,term_payments,decline_reason,stipulations on public.offers
for each row execute function public.crm_sales_deal_evidence();
create trigger crm_sales_stage_evidence after update of current_stage,funded_date on public.deals
for each row execute function public.crm_sales_deal_evidence();

create view public.crm_sales_deal_queue with (security_invoker = true) as
select d.id,d.business_name,d.current_stage,d.assigned_rep_id,d.owner_profile_id,d.closer_rep_id,
  d.sales_processor_id,d.sales_test,d.sales_lost,d.sales_source,d.sales_follow_up_at,d.sales_next_action,
  d.submitted_at,d.funded_date,d.funded_amount,d.gross_commission,d.converted_from_hot_lead_id,
  d.sales_stage,
  case
    when d.current_stage::text = 'Funded' then 'funded'
    when d.sales_lost or d.current_stage::text in ('Killed','KIF') then 'lost'
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
  d.requested_amount
from public.deals d
left join lateral (
  select bool_or(file_type='application') as application,bool_or(file_type='statement') as statement
  from public.deal_files where deal_id=d.id
) f on true;
revoke all on public.crm_sales_deal_queue from public, anon, authenticated;
grant select on public.crm_sales_deal_queue to authenticated;

create view public.crm_sales_conversion_review with (security_invoker = true) as
select l.id,l.business_name from public.hot_leads l
where (select public.crm_role()) = 'admin' and l.sales_review;
revoke all on public.crm_sales_conversion_review from public, anon, authenticated;
grant select on public.crm_sales_conversion_review to authenticated;

-- User operations are explicitly allowlisted. Financial and ownership fields are
-- excluded from this RPC. Existing stage and commission mutations keep their controls.
create function public.crm_record_sales_action(
  entity text, record_id uuid, action text, value text default null,
  explanation text default null, due_at timestamptz default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  role_name text := public.crm_role();
  user_id uuid := auth.uid();
  l public.hot_leads%rowtype;
  d public.deals%rowtype;
  actor_origin uuid; actor_assignee uuid; actor_closer uuid; actor_processor uuid;
  previous_stage text; closed boolean; event_kind text := action;
  event_note text := nullif(trim(explanation),'');
  is_lost boolean; current_due timestamptz; current_action text;
begin
  if coalesce(role_name,'') not in ('admin','rep') then raise exception 'Active CRM account required.'; end if;
  if length(coalesce(value,'')) > 200 or length(coalesce(explanation,'')) > 3000 then
    raise exception 'The supplied text is too long.';
  end if;
  if entity = 'lead' then
    select * into l from public.hot_leads where id=record_id for update;
    if not found or (role_name <> 'admin' and l.assigned_rep_id is distinct from user_id)
      or l.archived_at is not null or l.converted_at is not null or l.sales_review then
      raise exception 'Lead is unavailable for this action.';
    end if;
    actor_origin := coalesce(l.owner_profile_id,l.assigned_rep_id);
    actor_assignee := l.assigned_rep_id; previous_stage := l.sales_stage;
    is_lost := l.sales_lost; closed := l.sales_lost;
    current_due := l.next_follow_up_date; current_action := 'Follow up';
  elsif entity = 'deal' then
    select * into d from public.deals where id=record_id for update;
    if not found or (role_name <> 'admin' and d.assigned_rep_id is distinct from user_id) then
      raise exception 'Deal is unavailable for this action.';
    end if;
    actor_origin := coalesce(d.owner_profile_id,d.assigned_rep_id);
    actor_assignee := d.assigned_rep_id; actor_closer := d.closer_rep_id;
    actor_processor := d.sales_processor_id;
    previous_stage := coalesce(d.sales_stage,d.current_stage::text);
    is_lost := d.sales_lost or d.current_stage::text in ('Killed','KIF');
    closed := is_lost or d.current_stage::text = 'Funded';
    current_due := d.sales_follow_up_at; current_action := d.sales_next_action;
  else raise exception 'Unknown opportunity type.';
  end if;

  if action = 'lost' then
    if closed then raise exception 'Only open opportunities can be marked lost.'; end if;
    if value is null or value not in (
      'ghosted','incomplete_application','not_interested','competing_offer','lender_renewal',
      'all_funders_declined','too_expensive','insufficient_amount','unsuitable_payment',
      'merchant_rejected','missing_documents','failed_verification','killed_in_final',
      'withdrawn','ineligible','duplicate_invalid','other'
    ) then raise exception 'Select a structured loss reason.'; end if;
    if entity = 'lead' then
      update public.hot_leads set sales_lost=true,next_follow_up_date=null where id=record_id;
    else
      if role_name <> 'admin' then raise exception 'Admin access required to close a deal.'; end if;
      update public.deals set sales_lost=true,sales_follow_up_at=null,sales_next_action=null where id=record_id;
    end if;
  elsif action = 'reopened' then
    if not is_lost then raise exception 'The opportunity is already open.'; end if;
    if entity = 'lead' then
      update public.hot_leads set sales_lost=false where id=record_id;
    else
      if role_name <> 'admin' then raise exception 'Admin access required to reopen a deal.'; end if;
      update public.deals set sales_lost=false,
        current_stage=case when d.current_stage::text in ('Killed','KIF') then (
          case when exists (select 1 from pg_enum where enumtypid='public.pipeline_stage'::regtype and enumlabel='Application Submitted')
            then 'Application Submitted' else 'In Underwriting' end
        )::public.pipeline_stage else d.current_stage end,
        sales_stage=coalesce(d.sales_stage,'processing') where id=record_id;
    end if;
  elsif action = 'source' then
    if entity = 'lead' then
      update public.hot_leads set sales_source=nullif(trim(value),'') where id=record_id;
    else
      update public.deals set sales_source=nullif(trim(value),'') where id=record_id;
    end if;
    return;
  elsif action = 'processor' then
    if entity <> 'deal' or role_name <> 'admin' then raise exception 'Admin access required.'; end if;
    if nullif(value,'') is not null and not exists (
      select 1 from public.profiles where id::text=value and is_active
    ) then raise exception 'Choose an active processor.'; end if;
    update public.deals set sales_processor_id=nullif(value,'')::uuid where id=record_id;
    return;
  elsif action = 'test_record' then
    if role_name <> 'admin' then raise exception 'Admin access required.'; end if;
    if value is null or value not in ('true','false') then raise exception 'Choose whether this is a test record.'; end if;
    if entity = 'lead' then
      update public.hot_leads set sales_test=value::boolean where id=record_id;
    else
      if d.current_stage::text = 'Funded' then raise exception 'Funded deals cannot be marked as test.'; end if;
      update public.deals set sales_test=value::boolean where id=record_id;
    end if;
    return;
  elsif action = 'schedule' then
    if closed or due_at is null or (entity='deal' and nullif(trim(value),'') is null) then
      raise exception 'Enter a next action and a follow-up date for an open opportunity.';
    end if;
    if current_due is not distinct from due_at and (entity='lead' or current_action is not distinct from trim(value)) then return; end if;
    if entity='lead' then
      update public.hot_leads set next_follow_up_date=due_at,follow_up_status='scheduled' where id=record_id;
    else
      update public.deals set sales_follow_up_at=due_at,sales_next_action=trim(value) where id=record_id;
    end if;
    event_kind := 'task_scheduled';
    event_note := concat_ws(' · ', nullif(trim(value),''), event_note);
  elsif action = 'task_completed' then
    if closed or current_due is null then raise exception 'There is no outstanding follow-up.'; end if;
    if entity='lead' then
      update public.hot_leads set next_follow_up_date=null,follow_up_status='contacted' where id=record_id;
    else
      update public.deals set sales_follow_up_at=null,sales_next_action=null where id=record_id;
    end if;
    event_note := concat_ws(' · ', current_action, event_note);
  elsif action in ('call','text','email','note') then
    if action='note' and event_note is null then raise exception 'Enter a note.'; end if;
    if entity='lead' and action <> 'note' then
      update public.hot_leads set last_contact_date=(now() at time zone 'America/Los_Angeles')::date where id=record_id;
    end if;
  elsif action = 'stage' then
    if closed then raise exception 'Reopen the opportunity before changing its stage.'; end if;
    if entity='lead' then
      if value is null or value not in ('interested','application_requested','waiting_application','waiting_statements','partial_application')
        then raise exception 'Choose a prospecting stage.'; end if;
      if value = l.sales_stage then return; end if;
      update public.hot_leads set sales_stage=value where id=record_id;
      event_kind := case when value in ('application_requested','partial_application') then value else 'stage_changed' end;
    else
      if value is null or value not in ('processing','underwriting','stipulations','considering','contract_requested','final_conditions')
        then raise exception 'Choose an operational stage.'; end if;
      if role_name <> 'admin' and (value not in ('considering','contract_requested')
        or coalesce(d.sales_stage,'') not in ('pitched','considering','contract_requested')) then
        raise exception 'Only an admin can change this stage.';
      end if;
      if d.sales_stage = value then return; end if;
      update public.deals set sales_stage=value where id=record_id;
      event_kind := 'stage_changed';
    end if;
  elsif action in ('submitted','pitched','contracts_out','contracts_signed') then
    if entity <> 'deal' or closed then raise exception 'Choose an open deal.'; end if;
    if action <> 'pitched' and role_name <> 'admin' then raise exception 'Admin access required.'; end if;
    if action = 'submitted' then
      if nullif(trim(value),'') is null then raise exception 'Enter the funder name.'; end if;
      if not exists (select 1 from public.crm_sales_events where deal_id=record_id and kind='application_completed')
        then raise exception 'Attach the application and statement before recording submission.'; end if;
      if exists (select 1 from public.crm_sales_events where deal_id=record_id and kind='submitted'
          and lower(trim(funder))=lower(trim(value))) then return; end if;
    elsif action = 'pitched' and not exists (
      select 1 from public.crm_sales_events where deal_id=record_id and kind='approved'
    ) then raise exception 'Record an approval before pitching.';
    elsif action = 'contracts_signed' and not exists (
      select 1 from public.crm_sales_events where deal_id=record_id and kind='contracts_out'
    ) then raise exception 'Record contracts sent first.';
    end if;
    if action <> 'submitted' and exists (
      select 1 from public.crm_sales_events where deal_id=record_id and kind=action
    ) then return; end if;
    if action <> 'submitted' or coalesce(d.sales_stage,'processing') in ('processing','submitted','underwriting','stipulations') then
      update public.deals set sales_stage=action where id=record_id;
    end if;
  else raise exception 'Unknown sales action.';
  end if;

  insert into public.crm_sales_events(lead_id,deal_id,kind,actor_id,origin_id,assigned_id,closer_id,processor_id,stage,reason,note,funder)
  values(case when entity='lead' then record_id end,case when entity='deal' then record_id end,
    event_kind,user_id,actor_origin,actor_assignee,actor_closer,actor_processor,
    case when action='stage' then value else previous_stage end,
    case when action='lost' then value end,event_note,case when action='submitted' then trim(value) end);
end;
$$;
revoke all on function public.crm_record_sales_action(text,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.crm_record_sales_action(text,uuid,text,text,text,timestamptz) to authenticated;

-- Both preview and execution use the same eligibility checks. Execution takes
-- row locks first and rechecks the exact selected IDs.
create function public.crm_sales_lead_eligibility(lead_ids uuid[], operation text)
returns table (id uuid, business_name text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(lead_ids),0) not between 1 and 100
    or operation is null or operation not in ('archive','delete','restore','reassign') then
    raise exception 'Select between 1 and 100 leads and a valid action.';
  end if;
  return query
  select requested.lead_id, coalesce(l.business_name,'Unavailable lead'),
    case
      when l.id is null then 'Lead no longer exists.'
      when protected.linked and operation in ('delete','restore','reassign') then 'Converted, linked to a deal, or awaiting conversion review.'
      when operation='delete' and not l.sales_test then 'Only explicitly marked test leads can be deleted.'
      when operation='archive' and l.archived_at is not null then 'Lead is already archived.'
      when operation='restore' and l.archived_at is null then 'Lead is not archived.'
      when operation='reassign' and (l.archived_at is not null or l.sales_lost) then 'Only active leads can be reassigned.'
      else null
    end
  from unnest(lead_ids) requested(lead_id)
  left join public.hot_leads l on l.id = requested.lead_id
  cross join lateral (select l.converted_at is not null or l.sales_review
    or exists(select 1 from public.deals d where d.converted_from_hot_lead_id=l.id)
    or exists(select 1 from public.activities a where a.hot_lead_id=l.id and
      (a.deal_id is not null or a.activity_type='hot_lead_converted')) as linked) protected;
end;
$$;
revoke all on function public.crm_sales_lead_eligibility(uuid[],text) from public, anon, authenticated;
grant execute on function public.crm_sales_lead_eligibility(uuid[],text) to authenticated;

create function public.crm_sales_manage_leads(lead_ids uuid[], operation text, target_rep uuid default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare blocked text; changed integer;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(lead_ids),0) not between 1 and 100 then raise exception 'Select between 1 and 100 leads.'; end if;
  if operation='reassign' then
    perform id from public.profiles where id=target_rep and role='rep' and is_active for update;
    if not found then raise exception 'Choose an active sales rep.'; end if;
  end if;
  perform l.id from public.hot_leads l where l.id=any(lead_ids) order by l.id for update;
  select string_agg(e.business_name || ' (' || e.reason || ')', ', ' order by e.business_name)
    into blocked from public.crm_sales_lead_eligibility(lead_ids,operation) e where e.reason is not null;
  if blocked is not null then raise exception 'Selection changed or contains blocked leads: %', blocked; end if;
  case operation
    when 'delete' then delete from public.hot_leads where id=any(lead_ids);
    when 'archive' then update public.hot_leads set archived_at=now() where id=any(lead_ids);
    when 'restore' then update public.hot_leads set archived_at=null where id=any(lead_ids);
    when 'reassign' then update public.hot_leads
      set owner_profile_id=coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id=target_rep where id=any(lead_ids);
    else raise exception 'Unknown lead action.';
  end case;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.crm_sales_manage_leads(uuid[],text,uuid) from public, anon, authenticated;
grant execute on function public.crm_sales_manage_leads(uuid[],text,uuid) to authenticated;

create or replace function public.crm_manage_hot_leads(lead_ids uuid[], archive_converted boolean)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  if archive_converted is null then raise exception 'Choose an action.'; end if;
  return public.crm_sales_manage_leads(lead_ids,case when archive_converted then 'archive' else 'delete' end,null);
end;
$$;
revoke all on function public.crm_manage_hot_leads(uuid[],boolean) from public, anon, authenticated;
grant execute on function public.crm_manage_hot_leads(uuid[],boolean) to authenticated;

create or replace function public.crm_reassign_leads(source_rep uuid, target_rep uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare changed_count integer;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if source_rep is null or target_rep is null or source_rep = target_rep then raise exception 'Choose two different reps.'; end if;
  perform id from public.profiles where id in (source_rep, target_rep) order by id for update;
  if not exists (select 1 from public.profiles where id = source_rep and role = 'rep')
    or not exists (select 1 from public.profiles where id = target_rep and role = 'rep' and is_active) then
    raise exception 'Choose an active destination rep.';
  end if;
  update public.hot_leads l
    set assigned_rep_id = target_rep, owner_profile_id = coalesce(l.owner_profile_id, l.assigned_rep_id)
    where l.assigned_rep_id = source_rep and l.archived_at is null and l.converted_at is null and not l.sales_lost and not l.sales_review;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
revoke all on function public.crm_reassign_leads(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_reassign_leads(uuid, uuid) to authenticated;

-- Use whichever compatible enum label is installed on the target database.
create function public.crm_set_sales_deal_stage(record_id uuid, stage_label text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare candidate text; legacy text;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  case stage_label
    when 'In Underwriting' then legacy := 'Application Submitted';
    when 'Offers' then legacy := 'Offers / Declines Received';
    when 'Contracts Out' then legacy := 'Contracts Requested';
    when 'Funded' then legacy := 'Funded';
    else raise exception 'Choose an open stage, or use Mark lost with a reason.';
  end case;
  select enumlabel::text into candidate from pg_enum where enumtypid='public.pipeline_stage'::regtype
    and enumlabel::text in (legacy,stage_label) order by (enumlabel::text=legacy) desc limit 1;
  if candidate is null then raise exception 'The pipeline label is unavailable.'; end if;
  update public.deals set current_stage=candidate::public.pipeline_stage, sales_stage=null
  where id=record_id and not sales_lost and current_stage::text not in ('Killed','KIF');
  if not found then raise exception 'Deal is unavailable. Reopen lost deals before changing their stage.'; end if;
end;
$$;
revoke all on function public.crm_set_sales_deal_stage(uuid,text) from public, anon, authenticated;
grant execute on function public.crm_set_sales_deal_stage(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
