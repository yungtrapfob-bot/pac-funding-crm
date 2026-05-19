alter type public.pipeline_stage rename value 'Application Submitted' to 'In Underwriting';
alter type public.pipeline_stage rename value 'Offers / Declines Received' to 'Offers';
alter type public.pipeline_stage rename value 'Contracts Signed' to 'Contracts Out';
alter type public.pipeline_stage rename value 'Killed' to 'KIF';
alter type public.pipeline_stage add value if not exists 'Hot Leads / Tasks';

alter table public.hot_leads
  add column if not exists next_follow_up_at timestamptz;

update public.hot_leads set next_follow_up_at = coalesce(next_follow_up_at, next_follow_up_date::timestamptz);

alter table public.hot_leads
  drop column if exists next_follow_up_date;

alter table public.deals
  add column if not exists application_complete boolean not null default false,
  add column if not exists docs_collected boolean not null default false,
  add column if not exists underwriting_notes text,
  add column if not exists submission_ready boolean not null default false,
  add column if not exists selected_offer_id uuid references public.offers(id),
  add column if not exists dl_received boolean not null default false,
  add column if not exists voided_check_received boolean not null default false,
  add column if not exists contracts_sent_date date,
  add column if not exists commission_payout_date date,
  add column if not exists renewal_eligibility_date date,
  add column if not exists fifty_percent_paid_date date,
  add column if not exists kif_reason text,
  add column if not exists converted_from_hot_lead_id uuid references public.hot_leads(id);

alter table public.offers
  add column if not exists decision text not null default 'approval',
  add column if not exists decline_reason text,
  add column if not exists total_payback numeric(12,2),
  add column if not exists term_payments int,
  add column if not exists selected_at timestamptz;
