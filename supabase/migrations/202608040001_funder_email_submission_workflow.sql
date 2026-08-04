-- Production-ready foundation for email-based funder submissions.
alter type public.submission_method add value if not exists 'manual_portal';

alter table public.funder_master
  add column if not exists primary_submission_email text,
  add column if not exists submission_cc text,
  add column if not exists submission_bcc text,
  add column if not exists subject_template text not null default 'Submission: {{business_name}} - {{requested_amount}} - {{state}}',
  add column if not exists body_template text not null default 'Hello,\n\nPlease review the attached funding package for {{business_name}}.\n\nOwner: {{owner_name}}\nState: {{state}}\nIndustry: {{industry}}\nMonthly revenue: {{monthly_revenue}}\nTime in business: {{time_in_business}}\nRequested amount: {{requested_amount}}\nPositions: {{positions}}\nFICO: {{fico}}\nAssigned rep: {{assigned_rep}}\nDeal ID: {{deal_id}}\n\nThank you.',
  add column if not exists required_document_types text[] not null default array['application','statement'],
  add column if not exists internal_submission_notes text,
  add column if not exists is_active boolean not null default true;

update public.funder_master
set primary_submission_email = nullif(submission_endpoint, '')
where primary_submission_email is null
  and submission_method = 'email'
  and submission_endpoint ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';

create type public.funder_submission_status as enum ('queued','sending','sent','failed');

create table if not exists public.funder_submission_logs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  funder_id uuid not null references public.funder_master(id),
  funder_name text not null,
  submission_method public.submission_method not null,
  recipient text not null,
  cc text,
  bcc text,
  subject text not null,
  body text not null,
  filenames_attached text[] not null default '{}',
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  status public.funder_submission_status not null default 'queued',
  provider_message_id text,
  error_details text,
  retry_count int not null default 0,
  priority text not null default 'normal',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists funder_submission_logs_deal_id_idx on public.funder_submission_logs (deal_id, submitted_at desc);
create unique index if not exists funder_submission_sent_once_idx on public.funder_submission_logs (deal_id, funder_id) where status in ('queued','sending','sent');

alter table public.funder_submission_logs enable row level security;

create policy "funder_submission_logs_admin_all" on public.funder_submission_logs for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
