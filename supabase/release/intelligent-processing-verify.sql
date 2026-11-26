-- Read-only. Run after the processing migrations.
select 'Confirmed destinations supported' as check_name,
  case when 2=(select count(*) from information_schema.columns where table_schema='public'
    and table_name='funder_submission_configs' and column_name in ('portal_url','verified_at'))
  then 'PASS' else 'FAIL' end as status
union all
select 'Submission evidence finalization restricted to service',
  case when coalesce(has_function_privilege('service_role',to_regprocedure('public.crm_complete_processing_submission(uuid,text,uuid,uuid)'),'EXECUTE'),false)
    and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.crm_complete_processing_submission(uuid,text,uuid,uuid)'),'EXECUTE'),true)
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.funder_submission_logs'),'INSERT,UPDATE,DELETE'),true)
  then 'PASS' else 'FAIL' end
union all
select 'Admin-only underwriting review and analysis history',
  case when exists(select from pg_class where oid=to_regclass('public.processing_document_analyses') and relrowsecurity)
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.processing_document_analyses'),'INSERT,UPDATE,DELETE'),true)
    and to_regprocedure('public.crm_save_processing_underwriting(uuid,uuid,jsonb)') is not null
  then 'PASS' else 'FAIL' end
union all
select 'Funder response review is protected and deduplicated',
  case when exists(select from pg_class where oid=to_regclass('public.processing_funder_responses') and relrowsecurity)
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.processing_funder_responses'),'INSERT,UPDATE,DELETE'),true)
    and to_regprocedure('public.crm_review_funder_response(uuid,uuid,text,jsonb)') is not null
  then 'PASS' else 'FAIL' end;
