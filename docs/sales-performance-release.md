# Sales Performance Center release

## Rollout

1. Preview this branch against an isolated, production-compatible Supabase project. Use separate Auth and Storage for browser acceptance.
2. Before touching production, take a recoverable Supabase backup. Record row counts for profiles, leads, deals, offers, activities and document metadata. Save the commission count and amount total, and retain a separate backup of private Storage objects if project backups exclude their contents.
3. In the production SQL Editor, run the complete [read-only preflight](../supabase/release/sales-performance-preflight.sql). Review every warning and resolve any failure. This uses live schema evidence and makes no assumption about the Supabase migration ledger.
4. In a maintenance window, paste the complete [sales performance migration](../supabase/migrations/202608060001_sales_performance.sql) into the SQL Editor and run it once as the project migration owner. It runs in one transaction and requires no enum changes. A lock timeout rolls back the transaction. If it fails, review the error and current schema before retrying.
5. Run the complete [read-only verification](../supabase/release/sales-performance-verify.sql). Compare previously captured counts and commission totals. Deploy the reviewed app only after the database verification passes. Keep the existing auth/storage and Vercel configuration.
6. Before reopening traffic, sign in as a known admin and an existing rep. Compare the previously linked converted leads against Active and Converted, open the appropriate pipeline and an authorized private document, check the personal ledger, and check the company and rep dashboard access. Use synthetic write acceptance only on staging.

If application acceptance fails after the database commits, pause CRM writes before rolling back the app. The new schema is additive, but old screens do not understand the new active-queue rules or sales action history. Keep the new data for recovery. For a database issue, take a second backup and reconcile writes since the initial backup before deciding between a forward fix and a point-in-time restore. Restoring a backup over later writes can lose new work. The release leaves original commission rows and routine intact.

## Current work and history

- Active prospecting is an unarchived, unconverted, non-terminal lead queue. Records with ambiguous conversion signals have an admin review view. Exact explicit legacy loss tags can suppress an active lead, while date-filtered losses require a recorded loss event.
- Direct deal links and conversion activities naming a real deal establish historical conversion. The migration does not guess from names or create missing merchant links. Historical follow-up dates remain intact. New conversion locks the lead and creates the deal, linked history, origin attribution and queue closure in the same transaction. Private documents upload separately. A retry can open the existing deal and complete the missing documents.
- Admin previews name blocked and eligible leads. The explicit confirmation applies only to eligible IDs, with server-side checks repeated under locks. Only leads marked as synthetic can be deleted. Deals, archive-protected conversion history and commission entries stay intact. Hard deletion of deals is intentionally unavailable.
- The lead and deal use one outstanding follow-up each. Due times are Pacific in the interface. Contact is logged through call, text or email actions. Opening a page does not count as contact. Processing, pitch, contract and loss actions are recorded separately.
- A new completed application requires application and statement document metadata. A direct application starts at the application cohort when those documents are present. Existing signed applications held outside the CRM remain untracked until documented.
- The Digital DIP groups manual submission records, sent submission evidence and offer responses by normalized funder name. Administrators can revise open or declined responses. The new timeline retains recorded response terms. Reps can read their authorized deals and responses. This release does not add any outbound integration.
- The operational deal queue is a security-invoker view, so its reads follow existing RLS. Mutating RPCs use explicit role and assignment checks. Destructive operations are admin-only. The new privileged functions do not write commission or gross financial fields.

## Reporting definitions

- **Activity in selected dates** uses a half-open Pacific date window. The supported ranges are today, Monday-based week, month, last 30 days or a custom range.
- **Opportunity cohort** starts with an interested lead or completed application in the selected window and follows the same opportunities through the observation date. A December funding can count toward a November cohort. A direct application has no fabricated interested-lead event.
- The first supported milestone per opportunity counts once, even when multiple funders respond. Unambiguous verified lead and deal links join histories. Conflicting links are disclosed and excluded from cohort calculations. No pitch or contract milestone is inferred from funding.
- **Rates** use the same opportunities that reached the denominator stage and have ordered evidence. Missing intermediate evidence with a documented later milestone is excluded where it would be mistaken for failure. Pending opportunities stay in eligible samples. Empty denominators are N/A.
- **Current inventory** uses mutually exclusive deal queues and shows ongoing work. Some historical stage milestones are unavailable, while current inventory remains visible. Funnel drill-downs show stage, attribution, milestone date and outcome.
- **Attribution** separates original owner, current assignee, closer and processor. Event history snapshots attribution at capture. The comparison view uses the selected attribution dimension once per opportunity, so two contributors do not double company totals. Personal data is still limited by existing permissions.
- **Speed and bottlenecks** use ordered timestamps and sample counts. Exact-duration medians exclude date-only and missing times. Aging uses three elapsed days for contracts and incomplete applications. Application-to-approval comparison uses the preceding date range with the same elapsed observation time and a minimum of five observed applications in each sample. Management counts link to open records and suggest investigation without claiming causation.
- **Losses** retain reason, stage, actor, and timestamp. Only the latest confirmed loss in the selected view counts. Reopened and duplicate/invalid opportunities are excluded from the current commercial loss breakdown. Legacy terminal stages without a recorded date remain present in inventory and outside dated loss analytics.
- **Commissions** come from the existing recognition ledger. Gross and retained commission use recorded funded-deal amounts, and retained is shown only where the linked ledger is measurable. The application does not present paid or projected amounts as earned. Ledger records for private deals remain available to their entitled rep through the personal ledger.

## Validation and limits

Run lint, type checking, production build and the deterministic report tests with Node.js 24. The report tests use a 100-opportunity cohort with 40 applications, 30 submissions, 24 approvals, 20 pitches, 12 contracts and eight later fundings. They also cover missing evidence, direct applications, DST boundaries, duplicate approval, attribution and loss/reopen behavior.

Run `scripts/qa-sales-browser.mjs` against a disposable local Supabase stack with the app on port 3100. It requires `QA_SALES_LOCAL_ONLY=yes`, the local Supabase URL and keys, and a Chromium executable. Set `QA_CHROMIUM` if it is not at `/usr/bin/chromium`. Set `QA_SCREENSHOT_DIR` to save screenshots outside the repo. The suite writes synthetic records and must run only in an isolated instance.

Original loss and conversion events without evidence remain untracked. This release does not estimate lost revenue, infer renewal type when absent, or attach old records by name. Deal performance reports presently page through the authorized dataset. Measure performance on staging with expected production volume before expanding access.
