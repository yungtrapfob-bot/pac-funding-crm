-- Canonicalize deal pipeline stages across mixed environments.
-- Canonical app stages: In Underwriting, Offers, Contracts Out, KIF, Funded

alter type public.pipeline_stage add value if not exists 'In Underwriting';
alter type public.pipeline_stage add value if not exists 'Offers';
alter type public.pipeline_stage add value if not exists 'Contracts Out';
alter type public.pipeline_stage add value if not exists 'KIF';

update public.deals
set current_stage = 'In Underwriting'
where current_stage::text in ('Application Submitted', 'Application Processed');

update public.deals
set current_stage = 'Offers'
where current_stage::text in ('Offers / Declines Received', 'Deal Pitched');

update public.deals
set current_stage = 'Contracts Out'
where current_stage::text in ('Contracts Requested', 'Contracts Signed');

update public.deals
set current_stage = 'KIF'
where current_stage::text = 'Killed';

alter table public.deals
  alter column current_stage set default 'In Underwriting';
