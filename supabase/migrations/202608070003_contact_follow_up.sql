begin;

create table if not exists public.crm_cleanup_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity text not null check (entity in ('lead','deal')),
  deleted_count integer not null check (deleted_count > 0),
  occurred_at timestamptz not null default now()
);
alter table public.crm_cleanup_audit enable row level security;
revoke all on public.crm_cleanup_audit from public, anon, authenticated;
grant select on public.crm_cleanup_audit to authenticated;
drop policy if exists crm_cleanup_audit_read on public.crm_cleanup_audit;
create policy crm_cleanup_audit_read on public.crm_cleanup_audit for select to authenticated
  using ((select public.crm_role())='admin');

create or replace function public.crm_deal_has_financial_history(d public.deals)
returns boolean language sql stable set search_path = ''
as $$
  select d.current_stage::text='Funded' or d.funded_date is not null
    or coalesce(d.funded_amount,0)<>0 or coalesce(d.gross_commission,0)<>0 or coalesce(d.gross_psf,0)<>0
    or d.commission_payout_date is not null or d.fifty_percent_paid_date is not null
    or exists(select from public.commissions c where c.deal_id=d.id)
    or exists(select from public.crm_sales_events e where e.deal_id=d.id and e.kind='funded')
$$;
revoke all on function public.crm_deal_has_financial_history(public.deals) from public, anon, authenticated;

create or replace function public.crm_cleanup_linked_deals(lead_ids uuid[])
returns table (lead_id uuid, deal_id uuid)
language sql stable set search_path = ''
as $$
  select d.converted_from_hot_lead_id, d.id from public.deals d where d.converted_from_hot_lead_id=any(lead_ids)
  union
  select a.hot_lead_id,a.deal_id from public.activities a
    where a.hot_lead_id=any(lead_ids) and a.deal_id is not null
$$;
revoke all on function public.crm_cleanup_linked_deals(uuid[]) from public, anon, authenticated;

create or replace function public.crm_sales_lead_eligibility(lead_ids uuid[], operation text)
returns table (id uuid, business_name text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(lead_ids),0) not between 1 and 100
    or operation is null or operation not in ('archive','delete','restore','reassign','mark_test','clear_test') then
    raise exception 'Select between 1 and 100 leads and a valid action.';
  end if;
  return query
  select requested.lead_id, coalesce(l.business_name,'Unavailable lead'),
    case
      when l.id is null then 'Lead no longer exists.'
      when protected.linked and operation in ('delete','restore','reassign') then 'Converted, linked to a deal, or awaiting conversion review.'
      when operation in ('mark_test','clear_test') and l.sales_review then 'Resolve conversion review before changing test classification.'
      when operation in ('mark_test','clear_test') and exists (
        select from public.crm_cleanup_linked_deals(array[l.id]) linked join public.deals d on d.id=linked.deal_id
        where public.crm_deal_has_financial_history(d)
      ) then 'A linked deal has protected financial history.'
      when operation in ('mark_test','clear_test') and exists (
        select from public.crm_cleanup_linked_deals(array[l.id]) linked
        join public.activities a on a.deal_id=linked.deal_id
        where a.hot_lead_id is not null and a.hot_lead_id<>l.id
        union all
        select from public.crm_cleanup_linked_deals(array[l.id]) linked
        join public.deals d on d.id=linked.deal_id
        where d.converted_from_hot_lead_id is not null and d.converted_from_hot_lead_id<>l.id
      ) then 'A linked deal has conflicting lead history.'
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

create or replace function public.crm_sales_manage_leads(lead_ids uuid[], operation text, target_rep uuid default null)
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
  if operation in ('mark_test','clear_test') then
    perform d.id from public.deals d where d.id in (
      select deal_id from public.crm_cleanup_linked_deals(lead_ids)
    ) order by d.id for update;
  end if;
  select string_agg(e.business_name || ' (' || e.reason || ')', ', ' order by e.business_name)
    into blocked from public.crm_sales_lead_eligibility(lead_ids,operation) e where e.reason is not null;
  if blocked is not null then raise exception 'Selection changed or contains blocked leads: %', blocked; end if;
  case operation
    when 'delete' then delete from public.hot_leads where id=any(lead_ids);
    when 'archive' then update public.hot_leads set archived_at=now() where id=any(lead_ids);
    when 'restore' then update public.hot_leads set archived_at=null where id=any(lead_ids);
    when 'mark_test', 'clear_test' then
      update public.deals set sales_test=(operation='mark_test') where id in (
        select deal_id from public.crm_cleanup_linked_deals(lead_ids)
      );
      update public.hot_leads set sales_test=(operation='mark_test') where id=any(lead_ids);
    when 'reassign' then update public.hot_leads
      set owner_profile_id=coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id=target_rep where id=any(lead_ids);
    else raise exception 'Unknown lead action.';
  end case;
  get diagnostics changed = row_count;
  if operation='delete' and changed>0 then
    insert into public.crm_cleanup_audit(actor_id,entity,deleted_count) values(auth.uid(),'lead',changed);
  end if;
  return changed;
end;
$$;

create or replace function public.crm_deal_cleanup_eligibility(deal_ids uuid[], operation text)
returns table (id uuid, business_name text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(deal_ids),0) not between 1 and 100
    or operation is null or operation not in ('delete','archive','restore','mark_test','clear_test','reassign') then
    raise exception 'Select between 1 and 100 deals and a valid action.';
  end if;
  return query
  select selected.deal_id, coalesce(d.business_name,'Unavailable deal'),
    case
      when d.id is null then 'Deal no longer exists.'
      when operation='archive' and d.archived_at is not null then 'Already archived.'
      when operation='restore' and d.archived_at is null then 'Not archived.'
      when operation='reassign' and (d.archived_at is not null or d.sales_lost
        or d.current_stage::text in ('Killed','KIF') or public.crm_deal_has_financial_history(d))
        then 'Only active deals without protected financial history can be reassigned.'
      when operation in ('mark_test','clear_test') and public.crm_deal_has_financial_history(d)
        then 'Funding or commission history is protected.'
      when operation in ('mark_test','clear_test') and (d.converted_from_hot_lead_id is not null
        or exists(select from public.activities a where a.deal_id=d.id and a.hot_lead_id is not null))
        then 'Change test classification from the linked lead to keep both records consistent.'
      when operation='delete' then case
        when public.crm_deal_has_financial_history(d)
          then 'Funding or commission history is protected. Archive this deal.'
        when d.converted_from_hot_lead_id is not null
          or exists(select from public.activities a where a.deal_id=d.id and a.hot_lead_id is not null)
          then 'Linked lead history is protected. Archive this deal.'
        when d.selected_offer_id is not null or d.contracts_sent_date is not null
          or exists(select from public.offers o where o.deal_id=d.id)
          or exists(select from public.funder_submission_logs f where f.deal_id=d.id)
          or exists(select from public.deal_files f where f.deal_id=d.id)
          or exists(select from storage.objects o where o.bucket_id='deal-files' and split_part(o.name,'/',1)=d.id::text)
          or exists(select from public.crm_sales_events e where e.deal_id=d.id)
          or exists(select from public.activities a where a.deal_id=d.id)
          then 'Documents, funder records, or sales history are protected. Archive this deal.'
      end
    end
  from unnest(deal_ids) selected(deal_id)
  left join public.deals d on d.id=selected.deal_id;
end;
$$;

create or replace function public.crm_manage_deal_cleanup(deal_ids uuid[], operation text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare changed integer;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(deal_ids),0) not between 1 and 100 then raise exception 'Select between 1 and 100 deals.'; end if;
  perform d.id from public.deals d where d.id=any(deal_ids) order by d.id for update;
  if exists (select from public.crm_deal_cleanup_eligibility(deal_ids,operation) e where e.reason is not null) then
    raise exception 'The selection changed or contains protected deals. Review it again.';
  end if;
  case operation
    when 'delete' then delete from public.deals where id=any(deal_ids);
    when 'archive' then update public.deals set archived_at=now() where id=any(deal_ids);
    when 'mark_test', 'clear_test' then update public.deals set sales_test=(operation='mark_test') where id=any(deal_ids);
    when 'restore' then update public.deals set archived_at=null where id=any(deal_ids);
    else raise exception 'Unknown deal action.';
  end case;
  get diagnostics changed = row_count;
  if operation='delete' and changed>0 then
    insert into public.crm_cleanup_audit(actor_id,entity,deleted_count) values(auth.uid(),'deal',changed);
  end if;
  return changed;
end;
$$;

create or replace function public.crm_record_sales_action(
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
    closed := is_lost or d.archived_at is not null or d.current_stage::text = 'Funded';
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
      perform public.crm_sales_manage_leads(array[record_id],case when value='true' then 'mark_test' else 'clear_test' end);
    else
      perform public.crm_manage_deal_cleanup(array[record_id],case when value='true' then 'mark_test' else 'clear_test' end);
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
    if action='call' and value is not null and value not in
      ('spoke','no_answer','voicemail','callback_requested','wrong_number') then
      raise exception 'Choose a valid call outcome.';
    end if;
    if action <> 'note' and (value is not null or due_at is not null) then
      if closed then raise exception 'Reopen the opportunity before logging contact.'; end if;
      if current_due is not null then
        perform public.crm_record_sales_action(entity,record_id,'task_completed');
      end if;
      if due_at is not null then
        perform public.crm_record_sales_action(entity,record_id,'schedule','Follow up',null,due_at);
      end if;
    end if;
    if entity='lead' and action <> 'note'
      and (action <> 'call' or value is null or value in ('spoke','callback_requested')) then
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
    case when action in ('lost','call') then value end,event_note,case when action='submitted' then trim(value) end);
end;
$$;

create or replace function public.crm_possible_duplicate_lead(contact_phone text, contact_email text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists(
    select from public.hot_leads l
    where l.archived_at is null and l.converted_at is null and not l.sales_lost and not l.sales_test
      and ((nullif(trim(contact_email),'') is not null and lower(l.email)=lower(trim(contact_email)))
        or (nullif(regexp_replace(contact_phone,'[^0-9]','','g'),'') is not null
          and regexp_replace(l.phone,'[^0-9]','','g')=regexp_replace(contact_phone,'[^0-9]','','g')))
  )
$$;
revoke all on function public.crm_possible_duplicate_lead(text,text) from public, anon, authenticated;
grant execute on function public.crm_possible_duplicate_lead(text,text) to authenticated;

-- Serialize the first document upload with cleanup of a deal that has no children yet.
create or replace function public.crm_lock_deal_document_parent()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.bucket_id='deal-files' then
    perform d.id from public.deals d
      where d.id::text=split_part(new.name,'/',1) and d.archived_at is null
        and (current_setting('role',true) not in ('authenticated','anon')
          or public.crm_role()='admin' or (public.crm_role()='rep' and d.assigned_rep_id=auth.uid()))
      for key share;
    if not found then raise exception 'Deal document is unavailable.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_lock_deal_document_parent() from public, anon, authenticated;
drop trigger if exists crm_lock_deal_document_parent on storage.objects;
create trigger crm_lock_deal_document_parent before insert on storage.objects
  for each row execute function public.crm_lock_deal_document_parent();

commit;
