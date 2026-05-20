-- Allow closer reps to run stage changes and offer selection actions.
drop policy if exists "deals_update_admin_or_owner" on public.deals;
create policy "deals_update_admin_owner_or_closer" on public.deals for update using (
  assigned_rep_id = auth.uid()
  or closer_rep_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  assigned_rep_id = auth.uid()
  or closer_rep_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "offers_update_admin_or_owner" on public.offers;
create policy "offers_update_admin_owner_or_closer" on public.offers for update using (
  exists (
    select 1
    from public.deals d
    where d.id = offers.deal_id
      and (
        d.assigned_rep_id = auth.uid()
        or d.closer_rep_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  )
) with check (
  exists (
    select 1
    from public.deals d
    where d.id = offers.deal_id
      and (
        d.assigned_rep_id = auth.uid()
        or d.closer_rep_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  )
);
