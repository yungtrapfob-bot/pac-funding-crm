-- Read-only. Run against the actual target schema.
select 'Funder inventory and configuration' as check_name,
  case when to_regclass('public.funder_master') is not null and to_regclass('public.funder_submission_configs') is not null
    then 'PASS' else 'FAIL' end as status
union all
select 'Durable submission history',
  case when to_regclass('public.funder_submission_logs') is not null and exists (
    select from pg_constraint c where c.conrelid=to_regclass('public.funder_submission_logs')
      and c.contype='u' and pg_get_constraintdef(c.oid) like 'UNIQUE (idempotency_key)%'
  ) then 'PASS' else 'FAIL' end
union all
select 'Document review and sales events',
  case when to_regprocedure('public.crm_record_sales_action(text,uuid,text,text,text,timestamptz)') is not null
    and to_regprocedure('public.crm_confirm_application_documents(uuid,integer,text)') is not null
    and to_regclass('public.crm_sales_deal_queue') is not null
  then 'PASS' else 'FAIL' end;
