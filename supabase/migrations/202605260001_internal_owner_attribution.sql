-- Adds explicit internal ownership attribution fields and safely backfills from existing assigned rep ownership.

alter table public.hot_leads
  add column if not exists owner_profile_id uuid references public.profiles(id);

alter table public.deals
  add column if not exists owner_profile_id uuid references public.profiles(id);

-- Backfill from legacy owner assignment where possible.
update public.hot_leads
set owner_profile_id = assigned_rep_id
where owner_profile_id is null
  and assigned_rep_id is not null;

update public.deals
set owner_profile_id = coalesce(owner_profile_id, assigned_rep_id);

-- Preserve attribution for converted deals by inheriting from source hot lead when available.
update public.deals d
set owner_profile_id = hl.owner_profile_id
from public.hot_leads hl
where d.converted_from_hot_lead_id = hl.id
  and d.owner_profile_id is null
  and hl.owner_profile_id is not null;

create index if not exists hot_leads_owner_profile_id_idx on public.hot_leads (owner_profile_id);
create index if not exists deals_owner_profile_id_idx on public.deals (owner_profile_id);
