-- Read-only. This returns one result table.
select * from (
  select * from (
with required_columns(table_name, column_name) as (
  values ('hot_leads','id'), ('hot_leads','business_name'), ('hot_leads','converted_at'),
    ('hot_leads','sales_review'), ('hot_leads','archived_at'), ('hot_leads','sales_lost'),
    ('deals','converted_from_hot_lead_id'), ('activities','hot_lead_id'),
    ('activities','deal_id'), ('activities','activity_type')
), checks as (
  select 'Required columns' as check_name, not exists (
    select from required_columns r where not exists (
      select from information_schema.columns c where c.table_schema='public'
        and c.table_name=r.table_name and c.column_name=r.column_name
    )
  ) as passed
  union all
  select 'Sales permissions and reconciliation functions',
    to_regprocedure('public.crm_role()') is not null
    and to_regprocedure('public.crm_sales_lead_eligibility(uuid[],text)') is not null
    and exists (select from pg_proc where oid=to_regprocedure('public.crm_sales_manage_leads(uuid[],text,uuid)')
      and prosecdef and prosrc like '%for update%' and prosrc like '%crm_sales_lead_eligibility%')
  union all
  select 'Direct conversion foreign key',
    exists (select from pg_constraint where conrelid=to_regclass('public.deals')
      and confrelid=to_regclass('public.hot_leads') and contype='f' and confdeltype in ('a','r')
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (converted_from_hot_lead_id)%')
  union all
  select 'Lead-only activity and timeline cleanup',
    2 = (select count(distinct conrelid) from pg_constraint
      where confrelid=to_regclass('public.hot_leads') and contype='f' and confdeltype='c'
        and ((conrelid=to_regclass('public.activities') and pg_get_constraintdef(oid) like 'FOREIGN KEY (hot_lead_id)%')
          or (conrelid=to_regclass('public.crm_sales_events') and pg_get_constraintdef(oid) like 'FOREIGN KEY (lead_id)%')))
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name
  ) lead
  union all
  select * from (
with required_columns(table_name, column_name) as (
  values ('deals','id'), ('deals','current_stage'), ('deals','funded_date'),
    ('deals','funded_amount'), ('deals','gross_commission'), ('deals','gross_psf'),
    ('deals','commission_payout_date'), ('deals','fifty_percent_paid_date'),
    ('deals','converted_from_hot_lead_id'), ('deals','selected_offer_id'), ('deals','contracts_sent_date'),
    ('commissions','deal_id'), ('crm_sales_events','deal_id'), ('crm_sales_events','kind'),
    ('activities','deal_id'), ('activities','hot_lead_id'), ('offers','deal_id'),
    ('funder_submission_logs','deal_id'), ('deal_files','deal_id')
), checks as (
  select 'Required deal and dependency columns' as check_name, not exists (
    select from required_columns r where not exists (
      select from information_schema.columns c where c.table_schema='public'
        and c.table_name=r.table_name and c.column_name=r.column_name
    )
  ) as passed
  union all
  select 'Security-invoker deal queue', exists (
    select from pg_class where oid=to_regclass('public.crm_sales_deal_queue')
      and 'security_invoker=true'=any(reloptions)
  )
  union all
  select 'Role and private storage infrastructure',
    to_regprocedure('public.crm_role()') is not null
    and to_regclass('storage.objects') is not null
    and not coalesce(has_table_privilege('authenticated',to_regclass('public.deals'),'DELETE'),true)
  union all
  select 'No unknown deal foreign keys', not exists (
    select from pg_constraint where contype='f' and confrelid=to_regclass('public.deals')
      and conrelid not in (to_regclass('public.commissions'),to_regclass('public.activities'),
        to_regclass('public.crm_sales_events'),to_regclass('public.offers'),
        to_regclass('public.deal_files'),to_regclass('public.funder_submission_logs'))
  )
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name
  ) deal
  union all
select 'Existing role-scoped sales action RPC' as check_name, case when exists (
  select from pg_proc where oid=to_regprocedure('public.crm_record_sales_action(text,uuid,text,text,text,timestamptz)')
    and prosecdef and prosrc like '%public.crm_role()%' and prosrc like '%for update%'
) then 'PASS' else 'FAIL' end as status
union all
select 'Document review prerequisites', case when
  to_regprocedure('public.crm_sales_deal_evidence()') is not null
  and exists (select from pg_trigger where tgrelid=to_regclass('public.deal_files')
    and tgname='crm_sales_document_evidence' and tgenabled in ('O','A'))
  and coalesce(has_table_privilege(current_user,to_regclass('storage.objects'),'TRIGGER'),false)
then 'PASS' else 'FAIL' end
) checks order by check_name;
