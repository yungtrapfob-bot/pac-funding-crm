begin;

-- Test status classifies analytics. The existing mutation rechecks this eligibility under row locks.
create or replace function public.crm_sales_lead_eligibility(lead_ids uuid[], operation text)
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

commit;
