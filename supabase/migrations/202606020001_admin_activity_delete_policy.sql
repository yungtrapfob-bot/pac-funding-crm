-- Allow the authenticated admin delete flow to clean up junk/test hot-lead activity rows
-- without depending on the service-role client. Reps still cannot delete activity history.
drop policy if exists "activities_delete_admin" on public.activities;
create policy "activities_delete_admin" on public.activities for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
