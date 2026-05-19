alter table public.hot_leads
  alter column next_follow_up_date type timestamptz
  using case when next_follow_up_date is null then null else next_follow_up_date::timestamp at time zone 'UTC' end;
