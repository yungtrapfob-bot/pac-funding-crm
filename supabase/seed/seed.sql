-- Ensure these users exist in Supabase Auth first:
-- michael@paragonarm.local / Eric / Vlad

insert into public.profiles (id, full_name, email, role)
select id, 'Michael V', email, 'admin'::public.user_role from auth.users where email = 'michael@paragonarm.local'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (id, full_name, email, role)
select id, 'Eric S', email, 'rep'::public.user_role from auth.users where email = 'eric@paragonarm.local'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (id, full_name, email, role)
select id, 'Vlad G', email, 'rep'::public.user_role from auth.users where email = 'vlad@paragonarm.local'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

with eric as (select id from public.profiles where email = 'eric@paragonarm.local'),
vlad as (select id from public.profiles where email = 'vlad@paragonarm.local')
insert into public.hot_leads (business_name, owner_name, phone, email, industry, monthly_revenue, time_in_business_months, state, positions, nsf_count, deposits, fico, notes, assigned_rep_id, last_contact_date, next_follow_up_date, follow_up_status, outcome_tag)
values
('Blue Harbor Logistics', 'Sam Ortiz', '212-555-1001', 'sam@blueharbor.com', 'Logistics', 185000, 48, 'NY', 2, 1, 85, 668, 'Needs quick working capital', (select id from eric), current_date - 1, current_date + 1, 'pending', 'hot'),
('Atlas Auto Repair', 'Rina Patel', '305-555-2233', 'rina@atlasauto.com', 'Auto', 92000, 30, 'FL', 1, 0, 60, 701, 'Owner open to weekly payments', (select id from vlad), current_date - 2, current_date + 2, 'scheduled', 'warm');

with eric as (select id from public.profiles where email = 'eric@paragonarm.local'),
vlad as (select id from public.profiles where email = 'vlad@paragonarm.local')
insert into public.deals (business_name, owner_name, phone, email, industry, monthly_revenue, time_in_business_months, state, positions, nsf_count, deposits, fico, notes, internal_notes, current_stage, assigned_rep_id, closer_rep_id, funded_date, funded_amount, gross_commission, gross_psf)
values
('Northside Roofing', 'Carl Bishop', '404-555-9821', 'carl@northside.com', 'Construction', 140000, 62, 'GA', 1, 1, 72, 645, 'Fast close requested', 'Collect final COI', 'Contracts Signed', (select id from eric), null, null, 0, 0, 0),
('Greenleaf Dental Group', 'Jules Meyer', '602-555-0082', 'jules@greenleafdental.com', 'Healthcare', 210000, 76, 'AZ', 1, 0, 96, 710, 'Renewal candidate', 'Closer assigned to Vlad', 'Funded', (select id from eric), (select id from vlad), current_date - 3, 150000, 18000, 6000),
('Metro Bodega', 'Luis Chen', '718-555-7712', 'luis@metrobodega.com', 'Retail', 78000, 22, 'NY', 3, 3, 44, 603, 'Volatile deposits', 'Likely decline', 'Killed', (select id from vlad), null, null, 0, 0, 0);

insert into public.offers (deal_id, funder, approval_amount, term, payment_frequency, factor_rate, payment_amount, stipulations, expiration_date, notes, status)
select d.id, 'Summit Capital', 120000, '12 months', 'daily', 1.32, 640, 'Updated bank statements required', current_date + 5, 'Primary offer', 'open'
from public.deals d where d.business_name = 'Northside Roofing';

insert into public.offers (deal_id, funder, approval_amount, term, payment_frequency, factor_rate, payment_amount, stipulations, expiration_date, notes, status)
select d.id, 'Beacon Funding', 150000, '10 months', 'weekly', 1.28, 4800, 'Driver license + voided check', current_date - 1, 'Accepted + funded', 'accepted'
from public.deals d where d.business_name = 'Greenleaf Dental Group';

select public.sync_commissions_for_deal(d.id)
from public.deals d
where d.current_stage = 'Funded';
