# Rep vs Admin Permissions Audit Checklist

Use this checklist before onboarding outside sales reps.

## Route protection

- Admin-only routes: `/admin`, `/admin/pipeline`, `/admin/users`, `/admin/funders`, and `/admin/processing`.
- Expected admin result: route loads normally.
- Expected rep result: direct URL is blocked server-side by the admin layout/page guard and middleware redirects the rep to `/dashboard`. The processing queue page also calls the admin role guard directly before loading queue data.

## Rep-visible data

- Reps can view only hot leads assigned to their profile.
- Reps can view only deals where they are the assigned rep or closer.
- Reps can view their own commission ledger rows only.
- Reps cannot view company-wide admin dashboard metrics, the processing queue, user management, internal user profile lists, or funder master screens.
- Reps cannot view deal-router/funder-master guideline data, processing submission desk data, processing notification endpoints, payout/renewal calculations, gross commission fields, or internal workflow notes on deal detail pages.
- Reps can review offer responses on assigned deals, but offer creation, selection, and financial structure changes are admin-only.

## Server-side action expectations

- Admin-only server actions:
  - `deleteHotLead`
  - `updateDealDetails`
  - `addOffer`
  - `selectOffer`
  - `updateDealStage`
  - `createRepUserAction`
  - `reconcileInternalAuthUsers`
  - `getProcessingQueue` data access path
  - `getInternalUserProfiles` data access path
  - `POST /api/notify-processing`
- Rep-allowed server actions remain scoped to the signed-in rep:
  - `createHotLead` assigns the new lead to the current profile.
  - `updateHotLead` requires the rep to own the lead and preserves the existing assignment.
  - `submitHotLeadConversion` and `convertHotLeadToDeal` require access to the source lead and preserve the source lead owner on the created deal.
  - `createDeal` assigns the new deal to the current profile.

## Destructive actions

- Reps cannot see lead delete UI and cannot execute the delete server action.
- Admin can delete non-converted test/junk hot leads.
- Converted hot leads are protected when either a conversion activity links a deal or a deal references `converted_from_hot_lead_id`.
- Lead activity rows are removed before the lead delete to avoid deployed databases with missing cascade behavior causing a dashboard error. The delete flow now uses the authenticated admin Supabase client plus an explicit admin-only `activities` delete policy, so it no longer depends on the service-role client for ordinary junk/test lead cleanup.

## Manual verification steps

1. Sign in as an admin and confirm `/admin`, `/admin/pipeline`, `/admin/users`, `/admin/funders`, and `/admin/processing` load.
2. Sign in as a rep and directly navigate to each admin route above; confirm the app redirects to `/dashboard` or shows an access-denied/not-found experience without exposing admin data.
3. As a rep, open `/hot-leads` and confirm only that rep's assigned leads appear. Attempt a known other-rep lead URL and confirm it returns `Lead not found.`
4. As a rep, open `/deals` and confirm only assigned/closer deals appear. Attempt a known other-rep deal URL and confirm it returns `Deal not found.`
5. As a rep, open an assigned deal and confirm there is no stage movement form, deal router, processing desk, payout/renewal card, internal notes form, offer creation form, or offer selection button.
6. As a rep, attempt direct server-action submission for `deleteHotLead`, `addOffer`, `selectOffer`, `updateDealStage`, and `updateDealDetails`; confirm the server rejects/redirects because the role check runs before mutation.
7. As an admin, create a disposable non-converted hot lead from `/hot-leads/new`, delete it from the hot-leads actions menu or lead-detail admin cleanup area, and confirm `/hot-leads?deleted=1` loads with the success banner.
8. As an admin, attempt to delete a converted lead and confirm the lead is preserved and the app redirects back to the lead detail with `?delete=converted`.
