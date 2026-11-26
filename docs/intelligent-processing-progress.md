# Intelligent Processing Desk

The owner supplied sections 1–20 after the initial checkpoint. This branch combines them with sections 21–30 and starts from main, including the released rep dashboard.

| Milestone | Acceptance criteria | Status |
| --- | --- | --- |
| A. Funder master and routing | Reconcile inventory, preserve source evidence, evaluate active funders with review for incomplete data, surface results automatically in the admin processing queue. | Checkpoint pushed after routing tests, lint, and type checking |
| B. Submission workspace | Select individually approved recipients, render independent packages, verify identity and retry behavior, record confirmed email and assisted portal submissions in the existing tracker. | Checkpoint pushed after Chromium mock email, partial failure, portal, DIP and rep isolation tests |
| C. Document analysis | Disabled external integrations, mock processing, deterministic calculations with evidence, reviewed inputs feeding routing. | Checkpoint pushed after synthetic PDF review, arithmetic, and permission tests |
| D. Incoming responses | Mock ingestion, verified thread matching or review queue, reviewed and idempotent DIP updates. | Checkpoint pushed after synthetic reply import, deduplication and reviewed offer tests |
| E. Release validation | Synthetic browser acceptance, screenshots, permission and failure tests, and ordered deployment instructions. | Pending |

Production data, real submissions, and deployments are outside this development session.

## Inventory reconciliation

The checked-in workbook export and disposable database each have 39 funder rows. The local master has 12 marked Email without a stored recipient, one marked Portal without a stored endpoint, and 26 with a TBD method. The local submission configuration table initially had no rows. These observations are from repository and local data, not live configuration. Production values should be reviewed in Funder Master. The workflow preserves existing funder UUIDs and associates legacy configuration by its normalized name key. Duplicate keys and unmatched configurations require an administrator to review them. No contacts or guidelines were inferred.

## Submission configuration

- Email defaults to disabled. For controlled local testing, set `FUNDER_EMAIL_PROVIDER=test` and `FUNDER_SUBMISSION_TEST_RECIPIENT=processing-qa@example.test`. The test provider performs no network calls, rejects mismatched recipients and CC/BCC, and requires a deal marked as a test record.
- A live transactional sender requires `FUNDER_EMAIL_PROVIDER=resend`, `FUNDER_EMAIL_LIVE_ENABLED=true`, server-only `RESEND_API_KEY`, and `FUNDER_EMAIL_FROM` on a verified business domain. Approve the provider’s financial-document handling and retention before enabling. The server must be able to reach `api.resend.com`. Provider acceptance is not proof of inbox delivery. Monitor the provider dashboard for subsequent delivery events.
- Verify the exact recipient list or HTTPS portal in Funder Master after every configuration edit. For eligible deals, select up to eight funders and review each package. Sensitive supporting documents are opt-in. Portal uploads are manual and the application records administrator confirmation.
- A known pre-acceptance failure can be retried after review. Uncertain transport outcomes are held. A stored acceptance ID can reconcile the tracker without another send. If the ID was never returned or stored, verify the original send with the provider before any external retry.

## Financial review configuration

- External analysis defaults to disabled. `PROCESSING_ANALYSIS_PROVIDER=mock` enables the bundled synthetic fixture provider on test records.
- External PDF extraction requires `PROCESSING_ANALYSIS_PROVIDER=openai`, `PROCESSING_ANALYSIS_EXTERNAL_APPROVED=true`, server-only `OPENAI_API_KEY`, and `PROCESSING_ANALYSIS_MODEL` set to a Responses API model that supports PDF input. It needs network access to `api.openai.com`. Review API billing, residency, applicable agreements, retention and merchant consent before enabling. The request specifies `store:false`, meaning application-managed response storage is disabled. Review provider abuse-monitoring and tenant data controls separately. ChatGPT subscriptions and API billing are separate.
- The tool accepts at most eight private application/statement PDFs and 12 MiB total. Analysis is requested manually. The application shows evidence-linked suggestions, reconciles balances before deriving average balance or negative days, and saves reviewed values only after an administrator approves or manually saves them. It never overwrites the business name or contact data. Funding classification is review material.
- No live analysis or inbox delivery was used in testing. Large, scanned, multi-account and incomplete documents may require manual review. No statement authenticity certification is provided.

## Incoming replies

- `PROCESSING_MAILBOX_PROVIDER=mock` enables synthetic replies on explicitly marked test deals with confirmed submissions. The mock uses no mailbox credentials.
- Read-only Gmail import requires `PROCESSING_MAILBOX_PROVIDER=gmail`, `PROCESSING_MAILBOX_APPROVED=true`, `PROCESSING_GMAIL_CLIENT_ID`, `PROCESSING_GMAIL_CLIENT_SECRET`, `PROCESSING_GMAIL_REFRESH_TOKEN`, and `PROCESSING_GMAIL_LABEL_ID`. Use a business Google Workspace mailbox with an authorized OAuth client and consent to `https://www.googleapis.com/auth/gmail.readonly`. Put secrets in server environment settings. Approve egress to `oauth2.googleapis.com` and `gmail.googleapis.com` before use.
- Each manual import reads up to ten recent messages under the configured label. It stores a bounded plain-text excerpt and does not fetch attachments or alter labels. Live sender identity requires manual verification even with a reference match. The reviewer can assign an unmatched reply to a confirmed submission, correct proposed terms, or dismiss it.
- Reply extraction looks for explicit labeled facts and sends conditional wording or inconsistent figures to review. Other correspondence is retained for manual handling. Only an administrator-confirmed approval or decline can write an offer to the existing tracker. Funding and commissions keep their existing separate workflow.

## Deployment order

1. Back up staging and run the full [preflight](../supabase/release/intelligent-processing-preflight.sql) against its actual schema. Every row should report PASS.
2. Apply the complete scripts individually in this order, stopping at the first error.
   - [Submission authorization and evidence](../supabase/migrations/202608080001_processing_submissions.sql)
   - [Document analysis and underwriting](../supabase/migrations/202608080002_processing_analysis.sql)
   - [Funder reply review](../supabase/migrations/202608080003_processing_funder_responses.sql)
3. Run the full [verification SQL](../supabase/release/intelligent-processing-verify.sql). Every row should report PASS. Deploy the matching branch to staging and leave external integrations disabled.
4. Run synthetic acceptance for intake, document review, authorized submissions, duplicate reply handling, reviewed offers, and commission protection. Verify the admin queue and a separate rep login. Review the actual funder inventory and classify unverified routes.
5. With owner approval, pause staff processing, back up production, repeat SQL checks and deployment, and verify authorization before resuming. Enable each external provider only after its own approval and controlled credential verification.

If an application rollback is necessary, retain the additive tables and data. The new write restrictions intentionally prevent the old submission action from sending. Keep submissions paused and restore the matching release or follow the database recovery plan for the coordinated change. Do not relax permission restrictions to recover sending.
