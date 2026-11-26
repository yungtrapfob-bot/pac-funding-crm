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
  then 'PASS' else 'FAIL' end;
