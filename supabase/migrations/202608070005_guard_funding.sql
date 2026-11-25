begin;

create or replace function public.crm_guard_funding_stage()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- The browser and authenticated API share the same stage safeguards.
  if current_setting('role',true) is distinct from 'authenticated' then return new; end if;
  if old.current_stage::text='Funded' and (
    new.current_stage is distinct from old.current_stage
    or (new.funded_date,new.funded_amount,new.gross_commission,new.gross_psf)
      is distinct from (old.funded_date,old.funded_amount,old.gross_commission,old.gross_psf)
  ) then
    raise exception 'Funded stage and financial terms are protected from general edits.';
  end if;
  if new.current_stage is not distinct from old.current_stage then return new; end if;
  if old.archived_at is not null then raise exception 'Restore this deal before changing its stage.'; end if;
  if new.current_stage::text='Funded' and (
    new.funded_date is null or new.funded_date>(now() at time zone 'America/Los_Angeles')::date
    or coalesce(new.funded_amount,0)<=0 or new.gross_commission is null or new.gross_commission<0
    or (new.application_review_required and new.application_reviewed_at is null)
  ) then
    raise exception 'Save the actual funding date, positive funded amount, and commission, and complete document review before funding.';
  end if;
  return new;
end;
$$;
revoke all on function public.crm_guard_funding_stage() from public, anon, authenticated;
drop trigger if exists crm_guard_funding_stage on public.deals;
create trigger crm_guard_funding_stage
  before update of current_stage, funded_date, funded_amount, gross_commission, gross_psf on public.deals
  for each row execute function public.crm_guard_funding_stage();

create or replace function public.crm_reassign_cleanup_deals(deal_ids uuid[], target_rep uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare changed integer;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(deal_ids),0) not between 1 and 100 then raise exception 'Select between 1 and 100 deals.'; end if;
  perform id from public.profiles where id=target_rep and is_active and role='rep' for update;
  if not found then raise exception 'Choose an active sales rep.'; end if;
  perform id from public.deals where id=any(deal_ids) order by id for update;
  if exists(select from public.crm_deal_cleanup_eligibility(deal_ids,'reassign') where reason is not null) then
    raise exception 'The selection changed or contains protected deals. Review it again.';
  end if;
  update public.deals set owner_profile_id=coalesce(owner_profile_id,assigned_rep_id),assigned_rep_id=target_rep
    where id=any(deal_ids);
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.crm_reassign_cleanup_deals(uuid[],uuid) from public, anon, authenticated;
grant execute on function public.crm_reassign_cleanup_deals(uuid[],uuid) to authenticated;

commit;
