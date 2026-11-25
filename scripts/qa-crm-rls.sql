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
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'hot_lead_activity');
-- Intentionally no timeline conversion row. The direct foreign key must protect this lead.
insert into public.deals (id, business_name, owner_name, phone, email, assigned_rep_id, converted_from_hot_lead_id)
values ('c0000000-0000-4000-8000-000000000001', 'QA deal', 'Synthetic', '5550100', 'qa@example.test',
        'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001');
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

  declare lead_id uuid; deal_id uuid;
  begin
    insert into public.hot_leads (business_name, owner_name, phone, email, assigned_rep_id, next_follow_up_date)
      values ('QA rep-created lead', 'Synthetic', '5550100', 'qa@example.test', auth.uid(), '2027-07-12T16:30:00Z')
      returning id into lead_id;
    assert exists (select 1 from public.hot_leads where id = lead_id and owner_profile_id = auth.uid()), 'Rep-owned lead creation';
    insert into public.activities (hot_lead_id, actor_id, activity_type, details)
      values (lead_id, auth.uid(), 'hot_lead_activity', '{"note":"Synthetic follow-up"}');
    update public.hot_leads set next_follow_up_date = '2027-07-12T17:30:00Z' where id = lead_id;
    assert found, 'Rep follow-up update';

    insert into public.deals (business_name, owner_name, phone, email, assigned_rep_id, converted_from_hot_lead_id)
      values ('QA rep-created deal', 'Synthetic', '5550100', 'qa@example.test', auth.uid(), lead_id)
      returning id into deal_id;
    assert exists (select 1 from public.deals where id = deal_id and owner_profile_id = auth.uid()), 'Rep-owned deal conversion';
    insert into public.activities (hot_lead_id, deal_id, actor_id, activity_type)
      values (lead_id, deal_id, auth.uid(), 'hot_lead_converted');
    insert into storage.objects (bucket_id, name)
      values ('deal-files', deal_id::text || '/rep-qa.pdf');
    insert into public.deal_files (deal_id, file_type, path)
      values (deal_id, 'statement', deal_id::text || '/rep-qa.pdf');
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
    assert sqlerrm like '%conversion or linked deal%';
  end;
  assert exists (select 1 from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000002'), 'Mixed delete must be atomic';
  assert public.crm_reassign_leads('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002') = 1;
  assert exists (select 1 from public.hot_leads where id = 'b0000000-0000-4000-8000-000000000003'
    and owner_profile_id = 'a0000000-0000-4000-8000-000000000003' and assigned_rep_id = 'a0000000-0000-4000-8000-000000000002'), 'Origin preserved after reassignment';
  assert public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000003'::uuid], false) = 2;
  assert not exists (select 1 from public.activities where hot_lead_id = 'b0000000-0000-4000-8000-000000000002'), 'Lead timeline cascade';
  assert public.crm_manage_hot_leads(array['b0000000-0000-4000-8000-000000000001'::uuid], true) = 1;
  assert exists (select 1 from public.deals where id = 'c0000000-0000-4000-8000-000000000001'), 'Archive preserves converted deal';
  assert exists (select 1 from public.commissions where deal_id = 'c0000000-0000-4000-8000-000000000001'), 'Archive preserves commission';
end $$;

reset role;
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

rollback;
