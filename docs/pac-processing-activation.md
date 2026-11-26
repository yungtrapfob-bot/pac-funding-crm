# Processing Desk activation

## Release checkpoint

Production is on `c2f0b5a`. The production schema audit found the existing processing tables, no failed permission or idempotency assertions, 55 funder records (47 active and eight inactive), and 11 submission configurations matched to active funders. Each configuration contains an email address and awaits verification. There were no duplicate normalized funder keys or orphaned configurations. The historical stock migration ledger cannot establish migration history for manually applied SQL. This branch requires no new migration.

The five open processing deals all returned zero GO matches during the live snapshot. Four of five lacked reviewed underwriting and all five lacked a reviewed negative-day count. Those missing fields can affect specific funders. Product variants and conditional underwriting still require comparison with original guidelines.

Namecheap shows the approved Resend DKIM TXT and two sending CNAME records. Resend now shows the domain as verified. The domain-scoped sending key is staged for approval, with no credential created. Namecheap also shows two root SPF TXT records, one referencing EasyWP and one referencing Google Workspace. Google MX is routed at the root and Mailgun MX at the contact subdomain. Mailbox access and OAuth compatibility still require verification. Keep the existing SPF, MX, DMARC, Mailgun and website records intact until any separate DNS remediation is reviewed and approved.

## Preview-only provider pilot

Use a Vercel Preview deployment connected to a disposable Supabase project with the release migrations and synthetic data only. Scope each variable to the pilot branch and use Vercel's sensitive secret entry. Check that preview settings point to the disposable project before creating any records.

- Email: set `FUNDER_EMAIL_PROVIDER=resend-pilot`, `FUNDER_EMAIL_FROM` and `FUNDER_EMAIL_REPLY_TO` to the approved Paragon sender and processing inbox. Set `FUNDER_SUBMISSION_TEST_RECIPIENT` to the single approved inbox. Use a send-only `RESEND_API_KEY` scoped to the verified domain. The pilot demands Vercel Preview, a deal marked as synthetic, the exact destination, and empty CC/BCC. Leave the live send flag off. The mock test mode remains available without network access.
- Analysis: set `PROCESSING_ANALYSIS_PROVIDER=openai-pilot`, `PROCESSING_ANALYSIS_MODEL` and the server-only `OPENAI_API_KEY`. The pilot is available only in Vercel Preview and accepts only records marked as synthetic. Verify approved API project, billing arrangements and PDF support before testing. The existing client limits input to eight PDFs and 12 MiB combined and configures a 42-second API timeout with `store: false`. Review provider retention and project data controls independently before merchant use. Keep the production approval flag off.
- Replies: exercise the existing mock mailbox first. Run the Gmail pilot against an approved test-only label or test mailbox, with the minimum compatible OAuth grant. This branch adds no live Gmail credentials. Live import stays manual. The code checks the PAC reference and requires review of sender and material terms. It does not automatically book funding or commission.

Check the Resend delivery event and actual inbox/spam placement separately. Compare the Reply-To, subject, body, and attachment bytes against the synthetic package. Attempt a duplicate, an unverified recipient, and a test record with the wrong recipient. Reply from the approved synthetic funder address, confirm the exact submission match, and verify an administrator-reviewed offer appears once.

## Remaining release work

- Provision the restricted credential after owner approval. OpenAI API project, billing and mailbox OAuth access remain unresolved.
- Run the full synthetic browser and SQL permission suites against a disposable Supabase project. This branch's local unit tests mock external providers and do not establish delivery, model accuracy, inbox placement or OAuth behavior.
- Funder Master now uses aligned compact rows, a single selected submission form, and a separate inactive reference view. Existing guideline evidence stays in place. Direct guideline editing and revision history, product-specific routing coverage, and additional incoming status extraction are separate changes still needed.
- Verify destinations from authorized correspondence or current funder instructions before marking them verified. No real destinations were added or certified.
- Obtain separate merge and production deployment approval. To roll back this code-only checkpoint, revert the change and redeploy the previous application version with pilot variables removed.
