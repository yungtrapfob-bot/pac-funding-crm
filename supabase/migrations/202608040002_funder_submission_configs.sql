-- Store admin-managed funder submission/email configuration in a table that
-- exists independently of the imported funder routing matrix.
create table if not exists public.funder_submission_configs (
  id uuid primary key default gen_random_uuid(),
  funder_key text not null,
  funder_name text not null,
  submission_method text not null default 'tbd' check (submission_method in ('api','email','portal','manual_portal','tbd')),
  primary_submission_email text,
  submission_cc text,
  submission_bcc text,
  subject_template text not null default 'Submission: {{business_name}} - {{requested_amount}} - {{state}}',
  body_template text not null default '',
  required_document_types text[] not null default array['application','statement']::text[],
  internal_submission_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funder_submission_configs_funder_key_unique unique (funder_key)
);

create index if not exists funder_submission_configs_funder_name_idx
  on public.funder_submission_configs (funder_name);

alter table public.funder_submission_configs enable row level security;

drop policy if exists "funder_submission_configs_admin_processing_read" on public.funder_submission_configs;
create policy "funder_submission_configs_admin_processing_read"
  on public.funder_submission_configs
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('admin', 'processing')
    )
  );

drop policy if exists "funder_submission_configs_admin_processing_insert" on public.funder_submission_configs;
create policy "funder_submission_configs_admin_processing_insert"
  on public.funder_submission_configs
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('admin', 'processing')
    )
  );

drop policy if exists "funder_submission_configs_admin_processing_update" on public.funder_submission_configs;
create policy "funder_submission_configs_admin_processing_update"
  on public.funder_submission_configs
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('admin', 'processing')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('admin', 'processing')
    )
  );
