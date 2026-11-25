# Sales floor rollout

## Deployment order

1. In isolated staging, take a recoverable snapshot and open [preflight](../supabase/release/v1-sales-floor-preflight.sql). Paste the complete file into Supabase SQL Editor and run it. Every row should say PASS.
2. Apply these complete files individually, in order. Stop at the first error.
   - [Admin lead cleanup](../supabase/migrations/202608070001_admin_lead_cleanup.sql)
   - [Protected deal cleanup](../supabase/migrations/202608070002_admin_deal_cleanup.sql)
   - [Contact, follow-up, and test classification](../supabase/migrations/202608070003_contact_follow_up.sql)
   - [Application document review](../supabase/migrations/202608070004_application_document_review.sql)
3. Run the complete [verification file](../supabase/release/v1-sales-floor-verify.sql). Every row should say PASS.
4. Validate the matching application in staging with an administrator and two synthetic reps. Confirm follow-up, document upload, conversion, archive, protected funding history, and reports.
5. After owner approval, repeat the preflight, migrations, and verification on production using its actual schema and a recoverable backup. Deploy the matching app only after verification. Check sign-in, dashboard and pipeline links, processing, and authorized read-only commission and document access.

The migration files use transactions and rely on the previously applied Sales Performance schema. They do not rewrite existing merchant or financial rows. If an application rollback is needed, keep the additive archive column so its data survives. The previous web app can show archived deals in operational views. For function rollback, use the verified pre-change definitions from the backup. Permanent cleanup confirmations after launch require backup recovery if reversed.

## Rep quick start

1. Sign in and open Dashboard. Start with overdue or today's follow-ups.
2. Click New lead. Enter the business, contact, and either a phone number or an email. Set the next follow-up in Pacific time.
3. Open the merchant and use Log call, Log text, Log email, or Add note. Saving contact can complete the current follow-up and schedule the next one.
4. Collect the application and statement files. Paragon typically asks for four months. Click Submit to processing and attach the available files. On the deal, open Uploaded Files, review the application and statement coverage, enter the verified months, and click Confirm documents. An administrator can record an exception for fewer than four months. The processing queue shows incomplete or unreviewed files separately.
5. Open Deals to follow processing, funder responses, the pitch, and contracts. Use My Performance and Commissions for your personal totals.

## Admin cleanup

Select the visible leads or deals you want to manage, choose an action, and click Review selection. The review shows record names and specific reasons for blocked records. Confirm only the eligible subset. Converted leads and deals with commercial history are suitable for archive. Recognized commissions stay in the historical ledger. Confirmed deletions record the administrator, record type, count, and timestamp without keeping deleted merchant details. Test designation is separate, and funded records or linked funded records are protected from reclassification.
