alter type public.submission_method add value if not exists 'manual_portal';
alter type public.submission_method add value if not exists 'tbd';

alter table public.hot_leads
  add column if not exists requested_amount numeric(12,2) default 0;

alter table public.deals
  add column if not exists requested_amount numeric(12,2) default 0;
