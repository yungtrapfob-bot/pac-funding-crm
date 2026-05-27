-- Allow reps/admins with hot lead access to view associated activities, not only activities they authored.
drop policy if exists "activities_by_access" on public.activities;
create policy "activities_by_access" on public.activities for select using (
  actor_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  or (
    hot_lead_id is not null
    and exists (
      select 1
      from public.hot_leads hl
      where hl.id = activities.hot_lead_id
        and (
          hl.assigned_rep_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        )
    )
  )
);
