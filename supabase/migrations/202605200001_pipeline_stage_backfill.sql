-- Safe backfill to support canonical MCA pipeline stages across environments
-- Canonical stages: In Underwriting, Offers, Contracts Out, KIF, Funded

alter type public.pipeline_stage add value if not exists 'In Underwriting';
alter type public.pipeline_stage add value if not exists 'Offers';
alter type public.pipeline_stage add value if not exists 'Contracts Out';
alter type public.pipeline_stage add value if not exists 'KIF';

update public.deals
set current_stage = 'In Underwriting'
where current_stage = 'Application Submitted';

update public.deals
set current_stage = 'Offers'
where current_stage = 'Offers / Declines Received';

update public.deals
set current_stage = 'Contracts Out'
where current_stage = 'Contracts Signed';

update public.deals
set current_stage = 'KIF'
where current_stage = 'Killed';
