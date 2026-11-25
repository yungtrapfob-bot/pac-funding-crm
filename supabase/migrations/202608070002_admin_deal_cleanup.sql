begin;

alter table public.deals add column archived_at timestamptz;

create or replace view public.crm_sales_deal_queue with (security_invoker = true) as
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
  d.requested_amount, d.archived_at
from public.deals d
left join lateral (
  select bool_or(file_type='application') as application,bool_or(file_type='statement') as statement
  from public.deal_files where deal_id=d.id
) f on true;

create function public.crm_deal_cleanup_eligibility(deal_ids uuid[], operation text)
returns table (id uuid, business_name text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(deal_ids),0) not between 1 and 100
    or operation is null or operation not in ('delete','archive','restore') then
    raise exception 'Select between 1 and 100 deals and a valid action.';
  end if;
  return query
  select selected.deal_id, coalesce(d.business_name,'Unavailable deal'),
    case
      when d.id is null then 'Deal no longer exists.'
      when operation='archive' and d.archived_at is not null then 'Already archived.'
      when operation='restore' and d.archived_at is null then 'Not archived.'
      when operation='delete' then case
        when d.current_stage::text='Funded' or d.funded_date is not null
          or coalesce(d.funded_amount,0)<>0 or coalesce(d.gross_commission,0)<>0 or coalesce(d.gross_psf,0)<>0
          or d.commission_payout_date is not null or d.fifty_percent_paid_date is not null
          or exists(select from public.commissions c where c.deal_id=d.id)
          or exists(select from public.crm_sales_events e where e.deal_id=d.id and e.kind='funded')
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
revoke all on function public.crm_deal_cleanup_eligibility(uuid[],text) from public, anon, authenticated;
grant execute on function public.crm_deal_cleanup_eligibility(uuid[],text) to authenticated;

create function public.crm_manage_deal_cleanup(deal_ids uuid[], operation text)
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
    when 'restore' then update public.deals set archived_at=null where id=any(deal_ids);
    else raise exception 'Unknown deal action.';
  end case;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.crm_manage_deal_cleanup(uuid[],text) from public, anon, authenticated;
grant execute on function public.crm_manage_deal_cleanup(uuid[],text) to authenticated;

commit;
