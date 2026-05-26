-- Repairs missing internal ownership on recent records using best available attribution signals.
-- Safety: only fills when owner_profile_id is NULL and retains existing assignments.

update public.hot_leads hl
set owner_profile_id = hl.assigned_rep_id
where hl.owner_profile_id is null
  and hl.assigned_rep_id is not null;

-- Backfill recent hot leads from authenticated actor activity when assigned rep is missing.
update public.hot_leads hl
set assigned_rep_id = a.actor_id,
    owner_profile_id = a.actor_id
from (
  select hot_lead_id, max(actor_id) as actor_id
  from public.activities
  where hot_lead_id is not null
    and actor_id is not null
    and created_at >= now() - interval '90 days'
  group by hot_lead_id
) a
where hl.id = a.hot_lead_id
  and hl.owner_profile_id is null
  and hl.created_at >= now() - interval '90 days';

update public.deals d
set owner_profile_id = coalesce(d.owner_profile_id, d.assigned_rep_id)
where d.owner_profile_id is null;

-- Preserve ownership from source lead for converted deals when available.
update public.deals d
set owner_profile_id = hl.owner_profile_id,
    assigned_rep_id = coalesce(d.assigned_rep_id, hl.owner_profile_id)
from public.hot_leads hl
where d.converted_from_hot_lead_id = hl.id
  and hl.owner_profile_id is not null
  and d.owner_profile_id is null;

-- Backfill recent converted deals from conversion activity actor when still missing.
update public.deals d
set assigned_rep_id = a.actor_id,
    owner_profile_id = a.actor_id
from (
  select deal_id, max(actor_id) as actor_id
  from public.activities
  where deal_id is not null
    and activity_type = 'hot_lead_converted'
    and actor_id is not null
    and created_at >= now() - interval '90 days'
  group by deal_id
) a
where d.id = a.deal_id
  and d.owner_profile_id is null
  and d.created_at >= now() - interval '90 days';
