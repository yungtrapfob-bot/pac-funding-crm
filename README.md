# Paragon Arm (v1 scaffold)

Desktop-first internal CRM for Paragon Alternative Capital built with Next.js 14 App Router + Supabase.

## Proposed file tree

```txt
app/
  (auth)/login/page.tsx
  (dashboard)/
    layout.tsx
    dashboard/page.tsx
    hot-leads/page.tsx
    hot-leads/new/page.tsx
    deals/new/page.tsx
    deals/[id]/page.tsx
    commissions/page.tsx
    admin/page.tsx
    admin/pipeline/page.tsx
    admin/users/page.tsx
  api/notify-processing/route.ts
actions/deals.ts
components/
  layout/*
  dashboard/*
  tables/*
  ui/*
lib/
  auth.ts
  queries.ts
  supabase/{server,browser}.ts
supabase/
  migrations/202604030001_init.sql
  seed/seed.sql
```

## Proposed schema

- `profiles`
- `hot_leads`
- `deals`
- `deal_files`
- `offers`
- `commissions`
- `activities`
- enums: `user_role`, `pipeline_stage`, `offer_status`, `follow_up_status`, `commission_split_role`
- RPC: `sync_commissions_for_deal(target_deal_id uuid)`

## Implementation plan

1. Scaffold Next.js app shell + routing + shared UI components.
2. Add Supabase auth utilities + role middleware.
3. Build Rep/Admin pages (dashboards, lead/deal/offer/commission screens).
4. Add server actions for hot lead creation, deal submission, offers, pipeline stage updates.
5. Add Supabase SQL migration with RLS + commission sync function + storage bucket.
6. Add demo seed SQL for Michael V, Eric S, Vlad G and sample records.
7. Add setup docs + env requirements + TODO markers for email integration.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in Supabase values in `.env.local`.
4. Run SQL migration in your Supabase project (`supabase/migrations/202604030001_init.sql`).
5. In Supabase Auth, create users:
   - `michael@paragonarm.local`
   - `eric@paragonarm.local`
   - `vlad@paragonarm.local`
6. Run seed SQL (`supabase/seed/seed.sql`).
7. Run app:
   ```bash
   npm run dev
   ```

## Notes

- Email notification is intentionally stubbed in `app/api/notify-processing/route.ts` with a TODO marker.
- Deal submission uploads application/bank statement files into `deal-files` Supabase bucket.
- Commission recognition happens when stage is moved to `Funded` via RPC.
- Reps can only see their own data via RLS and query scoping.

## Vercel

Set the same env vars in Vercel project settings and deploy normally.
