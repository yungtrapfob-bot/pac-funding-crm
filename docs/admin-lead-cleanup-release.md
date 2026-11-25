# Admin lead cleanup rollout

1. Use a disposable staging database with the production-compatible sales performance schema. Take a recoverable backup before scheduling the production change.
2. Run [the complete preflight SQL](../supabase/release/admin-lead-cleanup-preflight.sql) in Supabase SQL Editor. Every row must say PASS.
3. Run [the complete migration](../supabase/migrations/202608070001_admin_lead_cleanup.sql). It replaces one eligibility function in a transaction and makes no record changes.
4. Run [the complete verification SQL](../supabase/release/admin-lead-cleanup-verify.sql). Every row must say PASS. In staging, verify that an admin can delete an unconverted lead and that a mixed selection identifies the converted lead as blocked.
5. After owner approval, repeat steps 2–4 on production before deploying the matching app. Confirm that the admin cleanup review lists names, states that deletion is permanent, and keeps converted records protected.

The existing authenticated mutation locks selected rows and rechecks eligibility. Lead-only activities and timeline entries follow their existing foreign keys. Test classification is independent of cleanup. A converted lead or one held for conversion review can be archived. The deal and financial history stay accessible to authorized users.

If verification fails, pause deployment. Restore the eligibility function definition from the pre-change backup. The migration makes no record changes, but a later confirmed deletion can only be recovered from backup. Check data retention policy before restoring deleted records.
