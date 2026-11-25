-- Read-only. This returns one result table.
select * from (
  select * from (
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
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name
  ) lead
  union all
  select * from (
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
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name
  ) deal
  union all
select 'Atomic contact and follow-up is installed' as check_name, case when exists (
  select from pg_proc where oid=to_regprocedure('public.crm_record_sales_action(text,uuid,text,text,text,timestamptz)')
    and prosecdef and prosrc like '%callback_requested%' and prosrc like '%task_completed%'
) then 'PASS' else 'FAIL' end as status
union all
select 'Duplicate lookup uses caller row security', case when exists (
  select from pg_proc where oid=to_regprocedure('public.crm_possible_duplicate_lead(text,text)') and not prosecdef
) and not coalesce(has_function_privilege('anon',to_regprocedure('public.crm_possible_duplicate_lead(text,text)'),'EXECUTE'),true)
then 'PASS' else 'FAIL' end
union all
select 'Test designation and document locking safeguards', case when exists (
  select from pg_proc where oid=to_regprocedure('public.crm_sales_manage_leads(uuid[],text,uuid)')
    and prosrc like '%crm_cleanup_linked_deals%' and prosrc like '%mark_test%'
) and exists (
  select from pg_trigger where tgrelid=to_regclass('storage.objects')
    and tgname='crm_lock_deal_document_parent' and tgenabled in ('O','A')
) and exists (
  select from pg_class where oid=to_regclass('public.crm_cleanup_audit') and relrowsecurity
) then 'PASS' else 'FAIL' end
) checks order by check_name;
