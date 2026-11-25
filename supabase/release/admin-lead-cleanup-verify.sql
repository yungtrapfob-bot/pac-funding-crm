-- Read-only. This verifies the installed policy without deleting any data.
with fn as (
  select prosecdef, prosrc from pg_proc
  where oid=to_regprocedure('public.crm_sales_lead_eligibility(uuid[],text)')
), checks as (
  select 'Admin-only eligibility and unchanged conversion protections' as check_name,
    coalesce((select prosecdef and prosrc like '%public.crm_role()%'
      and prosrc like '%converted_from_hot_lead_id%' and prosrc like '%hot_lead_converted%'
      and prosrc like '%sales_review%' from fn),false) as passed
  union all
  select 'Test classification is independent of deletion',
    coalesce((select prosrc not like '%sales_test%' from fn),false)
  union all
  select 'Anonymous and direct delete denied',
    not coalesce(has_function_privilege('anon',to_regprocedure('public.crm_sales_lead_eligibility(uuid[],text)'),'EXECUTE'),true)
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.hot_leads'),'DELETE'),true)
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name;
