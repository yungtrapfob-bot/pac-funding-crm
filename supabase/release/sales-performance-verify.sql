-- Read-only. Compare existing table counts and commissions with the backup.
with checks as (
  select 1 as n,'Milestone row security' as check_name,
    case when exists (select 1 from pg_class where oid=to_regclass('public.crm_sales_events') and relrowsecurity)
      and exists (select 1 from pg_policies where schemaname='public' and tablename='crm_sales_events' and policyname='crm_sales_events_read')
      and not has_table_privilege('authenticated','public.crm_sales_events','INSERT')
      then 'PASS' else 'FAIL' end as status,'Authenticated users have scoped reads. RPCs and triggers own inserts.' as details
  union all select 2,'Operational queue security',case when exists (
    select 1 from pg_class where oid=to_regclass('public.crm_sales_deal_queue') and 'security_invoker=true'=any(reloptions)
  ) then 'PASS' else 'FAIL' end,'Queue inherits deal and document RLS.'
  union all select 3,'Authoritative conversion coverage',case when exists (
    select 1 from public.hot_leads l where l.converted_at is null and (
      exists(select 1 from public.deals d where d.converted_from_hot_lead_id=l.id)
      or exists(select 1 from public.activities a join public.deals d on d.id=a.deal_id
        where a.hot_lead_id=l.id and a.activity_type='hot_lead_converted')
    )
  ) then 'FAIL' else 'PASS' end,'All directly or verifiably linked conversions should have a marker.'
  union all select 4,'Ambiguous conversions',case when count(*)=0 then 'PASS' else 'WARNING' end,
    format('%s leads are set aside for admin review.',count(*)) from public.hot_leads where sales_review
  union all select 5,'Existing ledger inventory','WARNING',
    format('%s commission records total %s. Compare against the snapshot.',count(*),coalesce(sum(commission_amount),0))
    from public.commissions
  union all select 6,'Table inventory','WARNING',format('Profiles %s, leads %s, deals %s, offers %s, files %s, activities %s. Compare against the snapshot.',
    (select count(*) from public.profiles),(select count(*) from public.hot_leads),(select count(*) from public.deals),
    (select count(*) from public.offers),(select count(*) from public.deal_files),(select count(*) from public.activities))
  union all select 7,'Local reconciliation and smoke test','WARNING',
    'On staging, confirm admin and rep access, conversion, private documents, funding and ledger output before deploying.'
)
select check_name,status,details from checks order by n;
