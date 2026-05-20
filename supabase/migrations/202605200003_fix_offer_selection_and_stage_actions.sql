-- Allow deal owners/admins to update offers so Select Offer can mark accepted/open.
create policy "offers_update_admin_or_owner" on public.offers for update using (
  exists (
    select 1
    from public.deals d
    where d.id = offers.deal_id
      and (
        d.assigned_rep_id = auth.uid()
        or exists (
          select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
) with check (
  exists (
    select 1
    from public.deals d
    where d.id = offers.deal_id
      and (
        d.assigned_rep_id = auth.uid()
        or exists (
          select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
);
