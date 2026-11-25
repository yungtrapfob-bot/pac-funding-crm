-- Read-only. Run before the deal cleanup migration.
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
select check_name,case when passed then 'PASS' else 'FAIL' end as status from checks order by check_name;
