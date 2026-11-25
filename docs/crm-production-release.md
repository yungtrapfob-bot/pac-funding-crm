# CRM production readiness

## Lead deletion diagnosis

The previous action used the presence of a `hot_lead_converted` activity as its only conversion check. The schema also has an independent, non-cascading `deals.converted_from_hot_lead_id → hot_leads.id` foreign key. A converted lead with only that direct reference passed the action's guard, then PostgreSQL rejected its deletion. The previous action had already committed removal of the timeline by that point. Database errors, including RLS failures, were thrown into the route's “Unable to load dashboard” boundary.

The checked-in schema also had self-referencing profile policies. PostgreSQL reports recursion when the authenticated session evaluates them. Admin delete policies that consult profiles depend on those policies working. Which error affected a specific production lead requires the live project's policy definitions and error logs.

The replacement locks the selected rows and checks both kinds of linkage before writing. Unlinked test leads and their lead-only activity are deleted in the same transaction. Converted or otherwise deal-linked leads can be archived, retaining their source record, deals, timeline and financial records. No deployment step deletes any leads.

## Permissions

| Operation | Active rep | Active admin |
| --- | --- | --- |
| View leads and deals | Assigned records only. Archived leads are hidden. | All records, including archived leads |
| Create leads, add timeline notes, schedule follow-up, submit deals | Own records | Yes |
| Retrieve or upload documents | Authorized deals through the CRM. Downloads are checked on each request. | Authorized CRM download and storage access |
| View and select an eligible offer | Assigned deals | Yes |
| Create or edit an offer, change deal stage or financials, mark funded | Denied | Yes |
| View commissions | Own ledger rows only | Company ledger |
| Admin pages, company totals, processing queue and funder settings | Denied | Yes |
| Delete eligible test leads, archive converted leads, reassign active leads | Denied | Yes |
| Create, reset, activate or deactivate a rep | Denied | Yes, existing admin accounts are excluded from these actions |
| Change a profile role through client credentials | Denied | Denied, manage administrator roles through trusted Supabase administration |

An inactive profile loses CRM database access even if its existing access token has time remaining. The registration setting and Auth account ban also govern sign-in. Already downloaded files and bearer links issued before the release are outside that database check.

## Release order

1. Use a separate staging Supabase project and Vercel preview for verification. Capture production schema and migration history read-only, confirm the existing active admin profiles are legitimate, and take a recoverable backup before the production cutover.
2. On an existing database with the preceding migrations, apply [202608050001_crm_access_and_lead_lifecycle.sql](../supabase/migrations/202608050001_crm_access_and_lead_lifecycle.sql) once in a release window, before deploying the app. The transaction adds archive and account state, indexes, and permission changes. Old app builds have incompatible lead and document write/download paths. Coordinate the two releases and keep traffic on a maintenance page if there is a gap.
3. The historical backfill files were repaired for fresh databases. An already-applied historical migration should stay in migration history. Compare existing definitions before applying any missing historical migration. For a fresh scratch instance, apply files individually in lexical filename order. Two historical files share the numeric version `202605200001`, which version-based migration tools may reject. Preserve the production migration ledger when reconciling that history.
4. In Supabase Auth, disable **Allow new users to sign up** and any unneeded provider that enables public enrollment. Keep email/password enabled and keep the approved site and callback URLs. The CRM's magic-link form only requests links for existing Auth users.
5. In Vercel confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` match the target project. Ensure Preview uses staging values. The download endpoint uses the existing service key after checking the caller's session and authorized file row. No new Vercel variable is required.
6. With a synthetic fixture, check one administrator and two reps. Exercise sign-in, creation, attribution, Pacific follow-up and notes, conversion with multiple documents, processing, offer selection, funding and commissions, then verify cross-rep requests fail. Check single and bulk deletion, archive, account state and an already-issued rep session. Review existing URL lifetimes and allow previously issued signed document URLs to expire before treating browser download access as fully cut over.

## Schema checked into the repository

- `hot_leads.requested_amount` is added in the May 28 schema migration. Deal intake accepts a requested amount and preserves the existing internal-notes representation. It does not assume `deals.requested_amount` exists.
- `owner_profile_id` is supported on leads and deals. New records are attributed on insert. Reassignment changes the active assignee while retaining the original owner.
- `deals.converted_from_hot_lead_id` is supported and now populated. The archive and deletion checks also recognize historical timeline links.
- The checked-in core schema has no migration for `created_by_user_id`. Core workflows use the existing owner, assignment and activity actor fields.

Run `scripts/qa-crm-rls.sql` as postgres on a disposable migrated database only. It checks database permissions with an administrator and two reps and rolls back its synthetic fixtures. Run `npm run qa:smoke` in an isolated environment with port 3000 free and the expected Supabase environment variables. Use `npm run typecheck`, `npm run lint`, and `npm run build` for application validation.
