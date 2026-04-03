create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'rep');
create type public.pipeline_stage as enum (
  'Application Submitted',
  'Application Processed',
  'Offers / Declines Received',
  'Deal Pitched',
  'Contracts Requested',
  'Contracts Signed',
  'Funded',
  'Killed'
);
create type public.offer_status as enum ('open', 'accepted', 'declined', 'expired');
create type public.follow_up_status as enum ('pending', 'contacted', 'scheduled', 'stale');
create type public.commission_split_role as enum ('opener', 'closer', 'solo');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'rep',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hot_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name text not null,
  phone text not null,
  email text not null,
  industry text,
  monthly_revenue numeric(12,2),
  time_in_business_months int,
  state text,
  positions int,
  nsf_count int,
  deposits int,
  fico int,
  notes text,
  assigned_rep_id uuid not null references public.profiles(id),
  last_contact_date date,
  next_follow_up_date date,
  follow_up_status public.follow_up_status not null default 'pending',
  outcome_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name text not null,
  phone text not null,
  email text not null,
  industry text,
  monthly_revenue numeric(12,2),
  time_in_business_months int,
  state text,
  positions int,
  nsf_count int,
  deposits int,
  fico int,
  notes text,
  internal_notes text,
  current_stage public.pipeline_stage not null default 'Application Submitted',
  submitted_at timestamptz not null default now(),
  assigned_rep_id uuid not null references public.profiles(id),
  closer_rep_id uuid references public.profiles(id),
  funded_date date,
  renewal_date date,
  funded_amount numeric(12,2) default 0,
  gross_commission numeric(12,2) default 0,
  gross_psf numeric(12,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deal_files (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  file_type text not null,
  path text not null,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  funder text not null,
  approval_amount numeric(12,2) not null,
  term text,
  payment_frequency text,
  factor_rate numeric(6,3),
  payment_amount numeric(12,2),
  stipulations text,
  expiration_date date,
  notes text,
  status public.offer_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  rep_id uuid not null references public.profiles(id),
  split_role public.commission_split_role not null,
  split_percent numeric(5,4) not null,
  commission_amount numeric(12,2) not null,
  psf_amount numeric(12,2) not null,
  recognized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  hot_lead_id uuid references public.hot_leads(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  activity_type text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.sync_commissions_for_deal(target_deal_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  d record;
begin
  select * into d from public.deals where id = target_deal_id;
  if d is null then return; end if;
  delete from public.commissions where deal_id = target_deal_id;
  if d.current_stage <> 'Funded' then return; end if;

  if d.closer_rep_id is null or d.closer_rep_id = d.assigned_rep_id then
    insert into public.commissions (deal_id, rep_id, split_role, split_percent, commission_amount, psf_amount, recognized_at)
    values (d.id, d.assigned_rep_id, 'solo', 0.50, d.gross_commission * 0.50, d.gross_psf * 0.50, now());
  else
    insert into public.commissions (deal_id, rep_id, split_role, split_percent, commission_amount, psf_amount, recognized_at)
    values
      (d.id, d.assigned_rep_id, 'opener', 0.35, d.gross_commission * 0.35, d.gross_psf * 0.35, now()),
      (d.id, d.closer_rep_id, 'closer', 0.15, d.gross_commission * 0.15, d.gross_psf * 0.15, now());
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.hot_leads enable row level security;
alter table public.deals enable row level security;
alter table public.deal_files enable row level security;
alter table public.offers enable row level security;
alter table public.commissions enable row level security;
alter table public.activities enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select using (
  auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "profiles_admin_write" on public.profiles for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "hot_leads_rep_own" on public.hot_leads for select using (
  assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "hot_leads_insert_rep" on public.hot_leads for insert with check (
  assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "hot_leads_update_rep_own" on public.hot_leads for update using (
  assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "deals_rep_own" on public.deals for select using (
  assigned_rep_id = auth.uid() or closer_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "deals_insert_rep" on public.deals for insert with check (
  assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "deals_update_admin_or_owner" on public.deals for update using (
  assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "deal_files_read_by_deal_access" on public.deal_files for select using (
  exists (select 1 from public.deals d where d.id = deal_files.deal_id and (d.assigned_rep_id = auth.uid() or d.closer_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')))
);
create policy "deal_files_insert_by_deal_access" on public.deal_files for insert with check (
  exists (select 1 from public.deals d where d.id = deal_files.deal_id and (d.assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')))
);

create policy "offers_by_deal_access" on public.offers for select using (
  exists (select 1 from public.deals d where d.id = offers.deal_id and (d.assigned_rep_id = auth.uid() or d.closer_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')))
);
create policy "offers_insert_admin_or_owner" on public.offers for insert with check (
  exists (select 1 from public.deals d where d.id = offers.deal_id and (d.assigned_rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')))
);

create policy "commissions_own_or_admin" on public.commissions for select using (
  rep_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "activities_by_access" on public.activities for select using (
  actor_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "activities_insert_owner" on public.activities for insert with check (
  actor_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

insert into storage.buckets (id, name, public)
values ('deal-files', 'deal-files', false)
on conflict (id) do nothing;

create policy "deal files access" on storage.objects for select using (
  bucket_id = 'deal-files'
);
create policy "deal files upload" on storage.objects for insert with check (
  bucket_id = 'deal-files'
);
