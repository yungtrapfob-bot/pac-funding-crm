-- Read-only. Run against the target schema before applying the migration.
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
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name;
