-- Run as postgres on a disposable Supabase database after applying the migrations.
-- Only synthetic records are used. The transaction is rolled back.
begin;
set local plpgsql.check_asserts = on;

insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003');
insert into public.profiles (id, full_name, email, role) values
  ('a0000000-0000-4000-8000-000000000001', 'QA Admin', 'qa-admin@example.test', 'admin'),
  ('a0000000-0000-4000-8000-000000000002', 'QA Rep A', 'qa-a@example.test', 'rep'),
  ('a0000000-0000-4000-8000-000000000003', 'QA Rep B', 'qa-b@example.test', 'rep');
insert into public.hot_leads (id, business_name, owner_name, phone, email, assigned_rep_id) values
  ('b0000000-0000-4000-8000-000000000001', 'QA converted', 'Synthetic', '5550100', 'qa@example.test', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000002', 'QA temporary A', 'Synthetic', '5550100', 'qa@example.test', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000003', 'QA temporary B', 'Synthetic', '5550100', 'qa@example.test', 'a0000000-0000-4000-8000-000000000003');
insert into public.activities (hot_lead_id, actor_id, activity_type) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'hot_lead_activity'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'hot_lead_activity');
-- The deal insert closes prospecting. The direct foreign key also protects the lead.
insert into public.deals (id, business_name, owner_name, phone, email, assigned_rep_id, converted_from_hot_lead_id)
values ('c0000000-0000-4000-8000-000000000001', 'QA deal', 'Synthetic', '5550100', 'qa@example.test',
        'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    delete from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'Expected the direct deal reference to prevent deletion';
  exception when foreign_key_violation then null;
  end;
end $$;
insert into public.offers (id, deal_id, funder, approval_amount)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'QA Funder', 10000);
insert into public.deal_files (deal_id, file_type, path)
values ('c0000000-0000-4000-8000-000000000001', 'application', 'c0000000-0000-4000-8000-000000000001/qa.pdf');
insert into storage.objects (bucket_id, name) values ('deal-files', 'c0000000-0000-4000-8000-000000000001/qa.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
do $$
begin
  assert public.crm_role() = 'rep', 'Expected Rep B';
  assert (select count(*) from public.profiles where id::text like 'a0000000-%') = 1, 'Rep profile scope';
  assert not exists (select 1 from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000001'), 'Cross-rep lead read';
  assert not exists (select 1 from public.deals where id = 'c0000000-0000-4000-8000-000000000001'), 'Cross-rep deal read';
  assert not exists (select 1 from public.offers where id = 'd0000000-0000-4000-8000-000000000001'), 'Cross-rep offer read';
  assert not exists (select 1 from public.deal_files where deal_id = 'c0000000-0000-4000-8000-000000000001'), 'Cross-rep file metadata read';
  assert not exists (select 1 from storage.objects where name = 'c0000000-0000-4000-8000-000000000001/qa.pdf'), 'Cross-rep object read';
  begin
    insert into public.deal_files (deal_id, file_type, path)
      values ('c0000000-0000-4000-8000-000000000001', 'application', 'c0000000-0000-4000-8000-000000000001/qa.pdf');
    raise exception 'Unexpected cross-rep file insert';
  exception when raise_exception then
    assert sqlerrm = 'Deal document is unavailable.';
  end;
  update public.hot_leads set business_name = 'QA unexpected' where id = 'b0000000-0000-4000-8000-000000000001';
  assert not found, 'Cross-rep lead update';
  begin
    perform public.crm_select_offer('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
    raise exception 'Unexpected offer selection';
  exception when raise_exception then
    assert sqlerrm = 'Deal is unavailable.';
  end;
  begin
    perform public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000003'::uuid], false);
    raise exception 'Unexpected rep delete';
  exception when raise_exception then
    assert sqlerrm = 'Admin access required.';
  end;
  begin
    perform public.sync_commissions_for_deal('c0000000-0000-4000-8000-000000000001');
    raise exception 'Unexpected rep commission sync';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
do $$
begin
  assert exists (select 1 from public.deals where id = 'c0000000-0000-4000-8000-000000000001'), 'Rep should read own deal';
  assert not exists (select 1 from storage.objects where name = 'c0000000-0000-4000-8000-000000000001/qa.pdf'), 'Rep cannot mint direct storage URLs';
  update public.deals set current_stage = 'Funded', gross_commission = 999
    where id = 'c0000000-0000-4000-8000-000000000001';
  assert not found, 'Rep must not change funding or payout';
  update public.offers set approval_amount = 999 where id = 'd0000000-0000-4000-8000-000000000001';
  assert not found, 'Rep must not edit offer';
  begin
    insert into public.offers (deal_id, funder, approval_amount)
      values ('c0000000-0000-4000-8000-000000000001', 'QA disallowed', 999);
    raise exception 'Unexpected rep offer creation';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'Unexpected rep privilege change';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.hot_leads set assigned_rep_id = 'a0000000-0000-4000-8000-000000000003'
      where id = 'b0000000-0000-4000-8000-000000000002';
    raise exception 'Unexpected rep reassignment';
  exception when insufficient_privilege then null;
  end;
  perform public.crm_select_offer('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
  assert (select current_stage::text from public.deals where id = 'c0000000-0000-4000-8000-000000000001') = 'Contracts Out';

  declare lead_id uuid; created_deal_id uuid;
  begin
    insert into public.hot_leads (business_name, owner_name, phone, email, assigned_rep_id, next_follow_up_date)
      values ('QA rep-created lead', 'Synthetic', '5550100', 'qa@example.test', auth.uid(), '2027-07-12T16:30:00Z')
      returning id into lead_id;
    assert exists (select 1 from public.hot_leads where id = lead_id and owner_profile_id = auth.uid()), 'Rep-owned lead creation';
    insert into public.activities (hot_lead_id, actor_id, activity_type, details)
      values (lead_id, auth.uid(), 'hot_lead_activity', '{"note":"Synthetic follow-up"}');
    update public.hot_leads set next_follow_up_date = '2027-07-12T17:30:00Z' where id = lead_id;
    assert found, 'Rep follow-up update';

    insert into public.deals (business_name, owner_name, phone, email, assigned_rep_id, converted_from_hot_lead_id, requested_amount)
      values ('QA rep-created deal', 'Synthetic', '5550100', 'qa@example.test', auth.uid(), lead_id, 75000)
      returning id into created_deal_id;
    assert exists (select 1 from public.deals where id = created_deal_id and owner_profile_id = auth.uid() and requested_amount = 75000), 'Rep-owned deal conversion';
    assert exists (select 1 from public.activities where hot_lead_id = lead_id and deal_id = created_deal_id
      and activity_type = 'hot_lead_converted'), 'Conversion writes linked activity';
    insert into storage.objects (bucket_id, name)
      values ('deal-files', created_deal_id::text || '/rep-qa.pdf');
    insert into public.deal_files (deal_id, file_type, path)
      values (created_deal_id, 'statement', created_deal_id::text || '/rep-qa.pdf');
    begin
      insert into public.deals (business_name, owner_name, phone, email, assigned_rep_id, current_stage)
        values ('QA disallowed funding', 'Synthetic', '5550100', 'qa@example.test', auth.uid(), 'Funded');
      raise exception 'Unexpected rep funded deal insertion';
    exception when insufficient_privilege then null;
    end;
  end;

end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
do $$
begin
  assert public.crm_role() = 'admin', 'Expected Admin';
  update public.deals set current_stage = 'Funded', gross_commission = 1200
    where id = 'c0000000-0000-4000-8000-000000000001';
  assert found, 'Admin funding update';
  assert (select commission_amount from public.commissions where deal_id = 'c0000000-0000-4000-8000-000000000001') = 600, 'Existing solo commission formula';
  begin
    perform public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid], false);
    raise exception 'Unexpected converted lead deletion';
  exception when raise_exception then
    assert sqlerrm like '%Converted, linked to a deal%';
  end;
  assert exists (select 1 from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000002'), 'Mixed delete must be atomic';
  assert public.crm_reassign_leads('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002') = 1;
  assert exists (select 1 from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000003'
    and owner_profile_id = 'a0000000-0000-4000-8000-000000000003' and assigned_rep_id = 'a0000000-0000-4000-8000-000000000002'), 'Origin preserved after reassignment';
  assert public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000003'::uuid], false) = 2;
  assert not exists (select 1 from public.activities where hot_lead_id = 'b0000000-0000-4000-8000-000000000002'), 'Lead timeline cascade';
  assert public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000001'::uuid], true) = 1;
  assert exists (select 1 from public.deals where id = 'c0000000-0000-4000-8000-000000000001'), 'Archive preserves converted deal';
  assert exists (select 1 from public.activities where hot_lead_id = 'b0000000-0000-4000-8000-000000000001'), 'Archive preserves lead timeline';
  assert exists (select 1 from public.commissions where deal_id = 'c0000000-0000-4000-8000-000000000001'), 'Archive preserves commission';
end $$;

reset role;
-- Other synthetic runs may have left active admin fixtures in this disposable database.
update public.profiles set is_active = false where role = 'admin' and is_active
  and id <> 'a0000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    update public.profiles set is_active = false where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'Unexpected last administrator deactivation';
  exception when raise_exception then
    assert sqlerrm = 'Keep at least one active administrator.';
  end;
end $$;
update public.profiles set is_active = false where id = 'a0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
do $$
begin
  assert public.crm_role() is null, 'Inactive account must fail closed with existing JWT';
  assert not exists (select 1 from public.deals where id = 'c0000000-0000-4000-8000-000000000001'), 'Inactive deal read';
  assert not exists (select 1 from public.commissions where deal_id = 'c0000000-0000-4000-8000-000000000001'), 'Inactive commission read';
end $$;


reset role;
update public.profiles set is_active = true where id = 'a0000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', now() - interval '1 minute', now()),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', now() + interval '1 minute', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"session_id":"e0000000-0000-4000-8000-000000000001"}', true);
do $$
begin
  assert public.crm_role() is null, 'Reactivation must not restore old sessions';
end $$;
select set_config('request.jwt.claims', '{"session_id":"e0000000-0000-4000-8000-000000000002"}', true);
do $$
begin
  assert public.crm_role() = 'rep', 'Reactivated rep can create a new session';
end $$;

-- Cleanup uses locked eligibility and preserves financial history.
reset role;
insert into public.deals (id,business_name,owner_name,phone,email,assigned_rep_id) values
  ('c0000000-0000-4000-8000-000000000011','QA empty deal','Synthetic','5550100','qa@example.test','a0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000012','QA funded deal','Synthetic','5550100','qa@example.test','a0000000-0000-4000-8000-000000000002');
update public.deals set current_stage='Funded', funded_amount=20000,gross_commission=1000
  where id='c0000000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.crm_manage_deal_cleanup(array['c0000000-0000-4000-8000-000000000011'::uuid],'delete');
    raise exception 'Unexpected rep deal delete';
  exception when raise_exception then
    assert sqlerrm='Admin access required.';
  end;
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
do $$
declare
  empty_id constant uuid := 'c0000000-0000-4000-8000-000000000011';
  funded_id constant uuid := 'c0000000-0000-4000-8000-000000000012';
  ledger_amount numeric;
begin
  select sum(commission_amount) into ledger_amount from public.commissions where deal_id=funded_id;
  assert ledger_amount=500, 'Existing solo ledger';
  assert (select reason from public.crm_deal_cleanup_eligibility(array[funded_id],'delete')) like 'Funding or commission%';
  begin
    perform public.crm_manage_deal_cleanup(array[empty_id,funded_id],'delete');
    raise exception 'Unexpected mixed deal delete';
  exception when raise_exception then
    assert sqlerrm='The selection changed or contains protected deals. Review it again.';
  end;
  assert public.crm_manage_deal_cleanup(array[empty_id],'delete')=1;
  assert public.crm_manage_deal_cleanup(array[funded_id],'archive')=1;
  assert (select archived_at from public.crm_sales_deal_queue where id=funded_id) is not null;
  assert (select sum(commission_amount) from public.commissions where deal_id=funded_id)=ledger_amount;
  assert public.crm_manage_deal_cleanup(array[funded_id],'restore')=1;
end $$;

rollback;
