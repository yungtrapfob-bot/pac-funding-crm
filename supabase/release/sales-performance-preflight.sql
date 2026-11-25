-- Read-only. Review warnings with production access before applying the release.
with required(relation, columns) as (
  values
    ('public.hot_leads','id business_name assigned_rep_id owner_profile_id archived_at next_follow_up_date last_contact_date created_at outcome_tag follow_up_status requested_amount'),
    ('public.deals','id business_name assigned_rep_id owner_profile_id closer_rep_id converted_from_hot_lead_id current_stage submitted_at funded_date funded_amount gross_commission gross_psf contracts_sent_date'),
    ('public.activities','id hot_lead_id deal_id actor_id activity_type created_at details'),
    ('public.offers','id deal_id funder status decision approval_amount created_at factor_rate payment_amount payment_frequency term term_payments decline_reason stipulations'),
    ('public.deal_files','id deal_id file_type path created_at'),
    ('public.funder_submission_logs','id deal_id funder_name submitted_at submitted_by status'),
    ('public.profiles','id full_name role is_active sessions_revoked_at'),
    ('public.commissions','id deal_id rep_id commission_amount recognized_at'),
    ('storage.objects','bucket_id name'),
    ('storage.buckets','id public')
), missing as (
  select string_agg(r.relation || '.' || col, ', ') as detail
  from required r cross join lateral unnest(string_to_array(r.columns,' ')) col
  where not exists (select 1 from pg_attribute a where a.attrelid=to_regclass(r.relation)
    and a.attname=col and a.attnum>0 and not a.attisdropped)
), routines as (
  select string_agg(name, ', ') as detail
  from unnest(array['public.crm_role()','public.crm_guard_conversion()',
    'public.crm_manage_hot_leads(uuid[],boolean)','public.crm_reassign_leads(uuid,uuid)',
    'public.sync_commissions_for_deal(uuid)']) name
  where to_regprocedure(name) is null
), checks as (
  select 1 as n, 'Required compatibility columns' as check_name,
    case when detail is null then 'PASS' else 'FAIL' end as status, coalesce(detail,'All present.') as details from missing
  union all select 2,'Required protected routines',case when detail is null then 'PASS' else 'FAIL' end,
    coalesce(detail,'All present.') from routines
  union all select 3,'Already applied',case when to_regclass('public.crm_sales_events') is null
    and not exists (select 1 from pg_attribute where attrelid=to_regclass('public.hot_leads') and attname='sales_stage' and not attisdropped)
    then 'PASS' else 'FAIL' end,'Inspect any prior or partial application before proceeding.'
  union all select 4,'Pacific follow-up types',case when exists (
    select 1 from pg_attribute where attrelid=to_regclass('public.hot_leads') and attname='next_follow_up_date' and atttypid='timestamptz'::regtype
  ) and exists (
    select 1 from pg_attribute where attrelid=to_regclass('public.hot_leads') and attname='last_contact_date' and atttypid='date'::regtype
  ) then 'PASS' else 'FAIL' end,'Requires prior Pacific compatibility migration.'
  union all select 5,'Current stage used when reopening legacy losses',case when exists (
    select 1 from pg_enum where enumtypid=to_regtype('public.pipeline_stage') and enumlabel in ('Application Submitted','In Underwriting')
  ) then 'PASS' else 'FAIL' end,'Requires a supported underwriting enum label.'
  union all select 6,'Core RLS and existing safeguards',case when not exists (
    select 1 from unnest(array['hot_leads','deals','deal_files','activities','commissions','offers','profiles']) t(name)
    where not exists(select 1 from pg_class where oid=to_regclass('public.' || t.name) and relrowsecurity)
      or not exists(select 1 from pg_policies where schemaname='public' and tablename=t.name and policyname='crm_active_account')
  ) then 'PASS' else 'FAIL' end,'Keep existing RLS and active-account restrictions.'
  union all select 7,'Conversion and commission triggers',case when
    exists(select 1 from pg_trigger where tgrelid=to_regclass('public.deals') and tgname='crm_guard_conversion' and tgenabled<>'D')
    and exists(select 1 from pg_trigger where tgrelid=to_regclass('public.deals') and tgname='crm_recognize_new_commissions' and tgenabled<>'D')
    then 'PASS' else 'FAIL' end,'Requires the production-readiness trigger paths.'
  union all select 8,'Storage ACL',case when exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='crm_private_deal_objects'
  ) and exists (select 1 from storage.buckets where id='deal-files' and public is false)
  then 'PASS' else 'FAIL' end,'Requires the private deal-files bucket and its document policy.'
  union all select 9,'Table and trigger ownership', 'WARNING',
    'Run as the same trusted migration owner used for Phase 2 compatibility. Verify custom triggers and permissions on CRM tables.'
  union all select 10,'Historical evidence and deployment', 'WARNING',
    'Back up data first. Compare ledger totals and row counts afterward. Confirm legacy authorized conversion links and keep hard deletion limited to explicitly marked synthetic records.'
  union all select 11,'Optional structured deal request amount',case when exists (
    select 1 from pg_attribute where attrelid=to_regclass('public.deals') and attname='requested_amount'
      and not attisdropped and atttypid<>'numeric'::regtype
  ) then 'FAIL' else 'PASS' end,'The release uses numeric deal request amounts when present and adds the column when absent.'
)
select check_name,status,details from checks order by n;
