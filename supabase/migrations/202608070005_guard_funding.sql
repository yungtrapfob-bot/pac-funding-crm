begin;

create function public.crm_guard_funding_stage()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- The browser and authenticated API share the same stage safeguards.
  if current_setting('role',true) is distinct from 'authenticated'
    or new.current_stage is not distinct from old.current_stage then return new; end if;
  if old.archived_at is not null then raise exception 'Restore this deal before changing its stage.'; end if;
  if old.current_stage::text='Funded' then
    raise exception 'A funded stage cannot be reversed through general stage controls.';
  end if;
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
create trigger crm_guard_funding_stage before update of current_stage on public.deals
  for each row execute function public.crm_guard_funding_stage();

commit;
