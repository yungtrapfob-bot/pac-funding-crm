-- Read-only. Run after the deal cleanup migration.
with checks as (
  select 'Archive field exposed through secure queue' as check_name, exists (
    select from pg_class c join pg_attribute a on a.attrelid=c.oid
    where c.oid=to_regclass('public.crm_sales_deal_queue')
      and 'security_invoker=true'=any(c.reloptions) and a.attname='archived_at' and not a.attisdropped
  ) as passed
  union all
  select 'Locked mutation rechecks eligibility', exists (
    select from pg_proc where oid=to_regprocedure('public.crm_manage_deal_cleanup(uuid[],text)')
      and prosecdef and prosrc like '%public.crm_role()%' and prosrc like '%for update%'
      and prosrc like '%crm_deal_cleanup_eligibility%'
  )
  union all
  select 'Authenticated RPC and no direct delete', coalesce(has_function_privilege(
    'authenticated',to_regprocedure('public.crm_manage_deal_cleanup(uuid[],text)'),'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',to_regprocedure('public.crm_manage_deal_cleanup(uuid[],text)'),'EXECUTE'),true)
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.deals'),'DELETE'),true)
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name;
