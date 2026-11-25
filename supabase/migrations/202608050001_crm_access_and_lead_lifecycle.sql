begin;

alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.hot_leads add column if not exists archived_at timestamptz;
alter table public.hot_leads add column if not exists owner_profile_id uuid references public.profiles(id);
alter table public.deals add column if not exists owner_profile_id uuid references public.profiles(id);
alter table public.deals add column if not exists converted_from_hot_lead_id uuid references public.hot_leads(id);
create index if not exists deals_converted_from_hot_lead_id_idx on public.deals(converted_from_hot_lead_id);
create index if not exists activities_hot_lead_id_idx on public.activities(hot_lead_id);

create or replace function public.crm_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() and is_active
$$;
revoke all on function public.crm_role() from public, anon, authenticated;
grant execute on function public.crm_role() to authenticated;

-- Profiles are provisioned through trusted Auth administration, never JWT user metadata.
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.crm_role()) = 'admin');
revoke insert, update, delete, truncate on public.profiles from public, anon, authenticated;

create function public.crm_keep_active_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.is_active then
    if tg_op = 'DELETE' or new.role <> 'admin' or not new.is_active then
      perform pg_advisory_xact_lock(11928472);
      if not exists (select 1 from public.profiles where id <> old.id and role = 'admin' and is_active) then
        raise exception 'Keep at least one active administrator.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.crm_keep_active_admin() from public, anon, authenticated;
create trigger crm_keep_active_admin before update of role, is_active or delete on public.profiles
  for each row execute function public.crm_keep_active_admin();


-- Restrictive policies also constrain older permissive policies on existing projects.
do $$
declare relation text;
begin
  foreach relation in array array[
    'profiles','hot_leads','deals','offers','deal_files','activities','commissions',
    'funder_master','funder_routing_inputs','funder_legend_rules',
    'funder_submission_logs','funder_submission_configs'
  ] loop
    if to_regclass(format('public.%I', relation)) is not null then
      execute format('create policy crm_active_account on public.%I as restrictive for all to authenticated using ((select public.crm_role()) in (''admin'', ''rep'')) with check ((select public.crm_role()) in (''admin'', ''rep''))', relation);
      execute format('revoke all on public.%I from public, anon', relation);
      execute format('revoke truncate on public.%I from authenticated', relation);
    end if;
  end loop;
end $$;

create policy crm_lead_scope on public.hot_leads as restrictive for all to authenticated
  using ((select public.crm_role()) = 'admin' or (assigned_rep_id = (select auth.uid()) and archived_at is null))
  with check ((select public.crm_role()) = 'admin' or (assigned_rep_id = (select auth.uid()) and archived_at is null));
revoke insert, update, delete on public.hot_leads from public, anon, authenticated;
grant insert (business_name, owner_name, phone, email, industry, monthly_revenue,
  time_in_business_months, state, positions, nsf_count, deposits, fico, notes,
  next_follow_up_date, follow_up_status, outcome_tag, assigned_rep_id, last_contact_date)
  on public.hot_leads to authenticated;
grant update (business_name, owner_name, phone, email, follow_up_status,
  next_follow_up_date, outcome_tag, last_contact_date) on public.hot_leads to authenticated;

create function public.crm_attribute_record()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.owner_profile_id := coalesce(new.owner_profile_id, new.assigned_rep_id);
  return new;
end;
$$;
revoke all on function public.crm_attribute_record() from public, anon, authenticated;
create trigger crm_attribute_hot_lead before insert on public.hot_leads
  for each row execute function public.crm_attribute_record();
create trigger crm_attribute_deal before insert on public.deals
  for each row execute function public.crm_attribute_record();

create function public.crm_reassign_leads(source_rep uuid, target_rep uuid)
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
    where l.assigned_rep_id = source_rep and l.archived_at is null;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
revoke all on function public.crm_reassign_leads(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_reassign_leads(uuid, uuid) to authenticated;

create policy crm_deal_scope on public.deals as restrictive for all to authenticated
  using ((select public.crm_role()) = 'admin' or assigned_rep_id = (select auth.uid()))
  with check ((select public.crm_role()) = 'admin' or assigned_rep_id = (select auth.uid()));
create policy crm_deal_admin_update on public.deals as restrictive for update to authenticated
  using ((select public.crm_role()) = 'admin') with check ((select public.crm_role()) = 'admin');
revoke insert, delete on public.deals from public, anon, authenticated;
grant insert (business_name, owner_name, phone, email, industry, monthly_revenue,
  time_in_business_months, state, positions, nsf_count, deposits, fico, notes,
  internal_notes, assigned_rep_id, converted_from_hot_lead_id) on public.deals to authenticated;

-- Serialize conversion with deletion and prevent duplicate new conversions.
create function public.crm_guard_conversion()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare lead public.hot_leads%rowtype;
begin
  if new.converted_from_hot_lead_id is null then return new; end if;
  select * into lead from public.hot_leads
   where id = new.converted_from_hot_lead_id for update;
  if not found or lead.archived_at is not null
    or new.assigned_rep_id is distinct from lead.assigned_rep_id
    or (auth.uid() is not null and public.crm_role() is distinct from 'admin'
        and lead.assigned_rep_id is distinct from auth.uid()) then
    raise exception 'Lead is unavailable for conversion.';
  end if;
  new.owner_profile_id := coalesce(lead.owner_profile_id, lead.assigned_rep_id);
  if exists (select 1 from public.deals where converted_from_hot_lead_id = lead.id)
    or exists (select 1 from public.activities where hot_lead_id = lead.id
      and activity_type = 'hot_lead_converted' and deal_id is not null) then
    raise exception 'This lead already has a deal.';
  end if;
  return new;
end;
$$;
revoke all on function public.crm_guard_conversion() from public, anon, authenticated;
create trigger crm_guard_conversion before insert on public.deals
  for each row execute function public.crm_guard_conversion();

create policy crm_offers_deal_scope on public.offers as restrictive for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));
create policy crm_offers_admin_insert on public.offers as restrictive for insert to authenticated
  with check ((select public.crm_role()) = 'admin');
create policy crm_offers_admin_update on public.offers as restrictive for update to authenticated
  using ((select public.crm_role()) = 'admin') with check ((select public.crm_role()) = 'admin');
revoke delete on public.offers from public, anon, authenticated;

create policy crm_file_deal_scope on public.deal_files as restrictive for all to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id))
  with check (split_part(path, '/', 1) = deal_id::text and exists (select 1 from public.deals d where d.id = deal_id));
revoke update, delete on public.deal_files from public, anon, authenticated;
update storage.buckets set public = false where id = 'deal-files';
create policy crm_private_deal_objects on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'deal-files' or exists (
    select 1 from public.deals d where d.id::text = (storage.foldername(name))[1]
  ))
  with check (bucket_id <> 'deal-files' or exists (
    select 1 from public.deals d where d.id::text = (storage.foldername(name))[1]
  ));
create policy crm_no_anonymous_deal_objects on storage.objects as restrictive for all to anon
  using (bucket_id <> 'deal-files') with check (bucket_id <> 'deal-files');
create policy crm_deal_object_admin_read on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'deal-files' or (select public.crm_role()) = 'admin');
create policy crm_deal_object_read on storage.objects for select to authenticated
  using (bucket_id = 'deal-files' and (select public.crm_role()) = 'admin');
create policy crm_deal_object_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-files' and exists (
    select 1 from public.deals d where d.id::text = (storage.foldername(name))[1]
  ));
create policy crm_deal_object_no_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'deal-files');
create policy crm_deal_object_no_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'deal-files') with check (bucket_id <> 'deal-files');

create policy crm_commission_scope on public.commissions as restrictive for select to authenticated
  using ((select public.crm_role()) = 'admin' or rep_id = (select auth.uid()));
revoke insert, update, delete on public.commissions from public, anon, authenticated;
revoke execute on function public.sync_commissions_for_deal(uuid) from public, anon, authenticated;
grant execute on function public.sync_commissions_for_deal(uuid) to service_role;
alter function public.sync_commissions_for_deal(uuid) set search_path = '';

-- Recognize new funded deals through the existing commission routine. Already recorded
-- commissions remain intact, including after a deal is reopened and funded again.
create function public.crm_recognize_new_commissions()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.commissions where deal_id = new.id) then
    perform public.sync_commissions_for_deal(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.crm_recognize_new_commissions() from public, anon, authenticated;
create trigger crm_recognize_new_commissions after update of current_stage, gross_commission, gross_psf on public.deals
  for each row when (new.current_stage::text = 'Funded'
    and (coalesce(new.gross_commission, 0) <> 0 or coalesce(new.gross_psf, 0) <> 0))
  execute function public.crm_recognize_new_commissions();


create policy crm_activity_record_scope on public.activities as restrictive for all to authenticated
  using ((select public.crm_role()) = 'admin' or (
    (hot_lead_id is null or exists (select 1 from public.hot_leads l where l.id = hot_lead_id))
    and (deal_id is null or exists (select 1 from public.deals d where d.id = deal_id))
  ))
  with check (
    actor_id = (select auth.uid())
    and (hot_lead_id is null or exists (select 1 from public.hot_leads l where l.id = hot_lead_id))
    and (deal_id is null or exists (select 1 from public.deals d where d.id = deal_id))
    and (activity_type <> 'hot_lead_converted' or exists (
      select 1 from public.deals d where d.id = deal_id and d.converted_from_hot_lead_id = hot_lead_id
    ))
  );
revoke update, delete on public.activities from public, anon, authenticated;

do $$
declare relation text;
begin
  foreach relation in array array[
    'funder_master','funder_routing_inputs','funder_legend_rules',
    'funder_submission_logs','funder_submission_configs'
  ] loop
    if to_regclass(format('public.%I', relation)) is not null then
      execute format('create policy crm_admin_only on public.%I as restrictive for all to authenticated using ((select public.crm_role()) = ''admin'') with check ((select public.crm_role()) = ''admin'')', relation);
    end if;
  end loop;
end $$;

create function public.crm_manage_hot_leads(lead_ids uuid[], archive_converted boolean)
returns integer language plpgsql security definer set search_path = ''
as $$
declare locked_count integer; changed_count integer;
begin
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if coalesce(cardinality(lead_ids), 0) not between 1 and 100 or archive_converted is null then
    raise exception 'Select between 1 and 100 leads.';
  end if;

  perform id from public.hot_leads where id = any(lead_ids) order by id for update;
  get diagnostics locked_count = row_count;
  if locked_count <> cardinality(lead_ids) then
    raise exception 'The selection changed. Refresh the list and try again.';
  end if;

  if exists (
    select 1 from public.hot_leads l where l.id = any(lead_ids)
      and archive_converted <> (
        exists (select 1 from public.deals d where d.converted_from_hot_lead_id = l.id)
        or exists (select 1 from public.activities a where a.hot_lead_id = l.id
          and (a.activity_type = 'hot_lead_converted' or a.deal_id is not null))
      )
  ) then
    if archive_converted then raise exception 'Only leads with a conversion or linked deal can be archived.'; end if;
    raise exception 'The selection includes a lead with a conversion or linked deal. Use Archive converted leads.';
  end if;

  if archive_converted then
    update public.hot_leads set archived_at = now() where id = any(lead_ids) and archived_at is null;
  else
    -- The foreign key cascades to lead-only activity in this same transaction.
    delete from public.hot_leads where id = any(lead_ids);
  end if;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
revoke all on function public.crm_manage_hot_leads(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.crm_manage_hot_leads(uuid[], boolean) to authenticated;

create function public.crm_select_offer(target_deal uuid, target_offer uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare deal public.deals%rowtype; selected public.offers%rowtype; caller_role text;
begin
  caller_role := public.crm_role();
  if caller_role is null then raise exception 'Active CRM account required.'; end if;
  select * into deal from public.deals where id = target_deal for update;
  if not found or (caller_role <> 'admin' and deal.assigned_rep_id is distinct from auth.uid()) then
    raise exception 'Deal is unavailable.';
  end if;
  if deal.current_stage::text in ('Funded', 'KIF', 'Killed') then raise exception 'This deal is closed.'; end if;
  select * into selected from public.offers where id = target_offer and deal_id = deal.id for update;
  if not found or selected.status::text not in ('open', 'accepted') or selected.decision = 'decline'
    or (selected.expiration_date is not null and selected.expiration_date < (now() at time zone 'America/Los_Angeles')::date) then
    raise exception 'Offer is unavailable.';
  end if;
  update public.offers set status = 'open' where deal_id = deal.id and status = 'accepted' and id <> selected.id;
  update public.offers set status = 'accepted' where id = selected.id;
  update public.deals set selected_offer_id = selected.id, current_stage = 'Contracts Out' where id = deal.id;
end;
$$;
revoke all on function public.crm_select_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_select_offer(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
