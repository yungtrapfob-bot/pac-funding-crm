alter table public.hot_leads
  add column if not exists next_follow_up_date timestamptz;

update public.hot_leads
set next_follow_up_date = coalesce(next_follow_up_date, next_follow_up_at)
where next_follow_up_at is not null;

alter table public.hot_leads
  drop column if exists next_follow_up_at;
