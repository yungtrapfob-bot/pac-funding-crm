-- Harden rep permissions before external rep onboarding.
-- Sensitive mutations are admin-only at the database policy layer; normal rep create/read flows remain scoped to owned records.

-- Hot lead hard deletes are intentionally admin-only. The app also uses the service role after an admin server action check.
drop policy if exists "hot_leads_delete_admin" on public.hot_leads;
create policy "hot_leads_delete_admin" on public.hot_leads for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Deal stage, assignment, funded amount, commission, and internal-note updates are admin/processing-controlled.
drop policy if exists "deals_update_admin_or_owner" on public.deals;
drop policy if exists "deals_update_admin_owner_or_closer" on public.deals;
create policy "deals_update_admin_only" on public.deals for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Funder responses/offers contain approval structure, factors, payments, payback, and lender decisions.
-- Reps may read offers for deals they can access, but cannot insert/update offer rows directly.
drop policy if exists "offers_insert_admin_or_owner" on public.offers;
drop policy if exists "offers_insert_admin_only" on public.offers;
create policy "offers_insert_admin_only" on public.offers for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "offers_update_admin_or_owner" on public.offers;
drop policy if exists "offers_update_admin_owner_or_closer" on public.offers;
drop policy if exists "offers_update_admin_only" on public.offers;
create policy "offers_update_admin_only" on public.offers for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Replace broad storage-object access with deal-scoped storage access based on the deal UUID folder prefix.
drop policy if exists "deal files access" on storage.objects;
drop policy if exists "deal files upload" on storage.objects;
drop policy if exists "deal_files_select_by_deal_access" on storage.objects;
drop policy if exists "deal_files_insert_by_deal_access" on storage.objects;

create policy "deal_files_select_by_deal_access" on storage.objects for select using (
  bucket_id = 'deal-files'
  and exists (
    select 1
    from public.deals d
    where d.id::text = (storage.foldername(name))[1]
      and (
        d.assigned_rep_id = auth.uid()
        or d.closer_rep_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  )
);

create policy "deal_files_insert_by_deal_access" on storage.objects for insert with check (
  bucket_id = 'deal-files'
  and exists (
    select 1
    from public.deals d
    where d.id::text = (storage.foldername(name))[1]
      and (
        d.assigned_rep_id = auth.uid()
        or d.closer_rep_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  )
);
