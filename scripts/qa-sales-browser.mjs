import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { join } from 'node:path';

assert.equal(process.env.QA_SALES_LOCAL_ONLY, 'yes', 'Explicit disposable local QA authorization required');
const base = 'http://127.0.0.1:3100';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, 'http://127.0.0.1:54321', 'The browser suite only writes synthetic local Supabase data.');
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const nonce = randomUUID().slice(0, 8);
const password = 'Qa-' + randomUUID();
const adminEmail = `admin-${nonce}@example.test`;

function must(result) {
  assert.ifError(result.error ? Error(result.error.message) : null);
  return result.data;
}

async function session(email, passwordToUse = password) {
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  return { client, auth: must(await client.auth.signInWithPassword({ email, password: passwordToUse })) };
}

const { user: adminUser } = must(await service.auth.admin.createUser({ email: adminEmail, password, email_confirm: true }));
must(await service.from('profiles').insert({ id: adminUser.id, email: adminEmail, full_name: 'QA Admin', role: 'admin' }));

const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  async function signIn(email, secret = password) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on('pageerror', (error) => console.error('Browser error:', error.message));
    page.on('requestfailed', (req) => { if (req.url().includes('/auth/v1/')) console.error('Auth request failed:', new URL(req.url()).pathname, req.failure()?.errorText); });
    page.on('response', async (res) => { if (res.url().includes('/auth/v1/')) console.log('Browser Auth HTTP', res.status(), new URL(res.url()).pathname); });
    await page.goto(base + '/login');
    await page.waitForFunction(() => Object.keys(document.querySelector('form') ?? {}).some((key) => key.startsWith('__reactProps$')));
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(secret);
    await page.locator('button[type=submit]').click();
    try {
      await page.waitForURL('**/dashboard', { timeout: 20_000 });
    } catch (error) {
      console.error(await page.locator('form').innerText());
      throw error;
    }
    return page;
  }


  const admin = await signIn(adminEmail);
  const makeRep = async (suffix, active = true) => {
    const email = `sales-${nonce}-${suffix}@example.test`;
    const { user } = must(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    must(await service.from('profiles').insert({ id: user.id, full_name: `Sales QA ${suffix} ${nonce}`, email, role:'rep', is_active:active }));
    return { email, id:user.id };
  };
  const [opener, another, third, closer, disabled] = await Promise.all([
    makeRep('opener'),makeRep('another'),makeRep('third'),makeRep('closer'),makeRep('inactive',false)
  ]);
  const rep = await signIn(opener.email);
  const stranger = await session(another.email);
  const inactive = await session(disabled.email);
  const name = `Merchant QA ${nonce}`;
  const fill = async (page, map) => {
    for (const [field,value] of Object.entries(map)) await page.locator(`[name=${field}]`).fill(value);
  };
  const action = async (page, kind, args = {}) => {
    const region = page.locator('#sales-actions');
    await region.getByLabel('Sales action').selectOption(kind);
    await fill(region, args);
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method()==='POST' && response.request().headers()['next-action']),
      region.getByRole('button',{name:'Save action'}).click(),
    ]);
    assert.equal(response.status(),200);
    await region.getByRole('status').filter({hasText:'Saved.'}).waitFor();
    await region.getByLabel('Sales action').locator('option:checked').filter({hasText:'Choose action'}).waitFor({state:'attached'});
  };
  await rep.goto(base+'/hot-leads/new');
  await fill(rep,{business_name:name,owner_name:'Synthetic QA',phone:'5550100199',email:'qa@example.test',notes:'First conversation'});
  await rep.getByRole('button',{name:/create/i}).click();
  await rep.waitForURL(/hot-leads\/[0-9a-f-]+\?created=1/);
  const lead = new URL(rep.url()).pathname.split('/').at(-1);
  await action(rep,'schedule',{due:'2027-07-12T09:30'});
  await action(rep,'call',{note:'Confirmed merchant contact'});
  await action(rep,'source',{value:'Cold calling'});
  await rep.locator('#sales-actions').getByLabel('Sales action').selectOption('stage');
  await rep.locator('#sales-actions [name=value]').selectOption('application_requested');
  await rep.locator('#sales-actions').getByRole('button',{name:'Save action'}).click();
  await rep.getByText('Application requested',{exact:true}).first().waitFor();
  await rep.goto(base+'/hot-leads?q='+nonce);
  await rep.getByRole('link',{name}).waitFor();
  await rep.goto(base+'/hot-leads/'+lead+'/convert');
  const intake = rep.locator('form').filter({has: rep.locator('[name=application_file]')});
  await fill(intake,{industry:'Logistics',state:'CA',fico:'680',requested_amount:'21000'});
  const doc = name => ({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic QA fixture')});
  await intake.locator('[name=application_file]').setInputFiles(doc('application.pdf'));
  await intake.locator('[name=bank_statements]').setInputFiles([doc('june.pdf'),doc('july.pdf')]);
  await intake.locator('button[type=submit]').click();
  await rep.waitForURL(/deals\/[0-9a-f-]+\?converted=1/);
  const deal = new URL(rep.url()).pathname.split('/').at(-1);
  const currentLead = must(await service.from('hot_leads').select('*').eq('id',lead).single());
  assert.ok(currentLead.converted_at);
  assert.equal(currentLead.next_follow_up_date,null);
  const currentDeal = must(await service.from('deals').select('*').eq('id',deal).single());
  assert.equal(currentDeal.owner_profile_id,opener.id);
  assert.equal(currentDeal.sales_source,'Cold calling');
  await rep.goto(base+'/hot-leads?q='+nonce);
  await rep.getByText('No leads found for this queue view.').waitFor();
  await rep.goto(base+'/hot-leads?view=converted&q='+nonce);
  await rep.getByRole('link',{name}).waitFor();
  await admin.goto(base+'/admin/processing');
  await admin.getByText(name,{exact:true}).first().waitFor();
  console.log('PASS browser lead intake, Pacific follow-up, contact, conversion, active exclusion, historical visibility and processing.');
  const dup = await service.from('deals').insert({
    business_name:name,owner_name:'Synthetic',email:'qa@example.test',phone:'5550100199',assigned_rep_id:opener.id,converted_from_hot_lead_id:lead
  });
  assert.match(dup.error?.message ?? '',/already has a deal/);
  assert.equal((await stranger.client.from('crm_sales_events').select('id').eq('deal_id',deal)).data.length,0);
  assert.equal((await stranger.client.from('crm_sales_deal_queue').select('id').eq('id',deal)).data.length,0);
  assert.equal((await inactive.client.from('crm_sales_deal_queue').select('id')).data.length,0);
  assert.equal((await stranger.client.from('deal_files').select('id').eq('deal_id',deal)).data.length,0);
  const files = must(await service.from('deal_files').select('id,path').eq('deal_id',deal));
  assert.equal(files.length,3);
  assert.equal((await rep.request.get(base+'/api/deal-files/'+files[0].id)).status(),200);
  assert.ok((await stranger.client.storage.from('deal-files').download(files[0].path)).error);
  assert.ok((await stranger.client.rpc('crm_record_sales_action',{entity:'deal',record_id:deal,action:'note',explanation:'Unauthorized synthetic test'})).error);
  assert.ok((await stranger.client.rpc('crm_sales_manage_leads',{lead_ids:[lead],operation:'delete'})).error);
  console.log('PASS duplicate conversion and database authorization checks.');
  must(await service.from('deals').update({closer_rep_id:closer.id}).eq('id',deal));
  await admin.goto(base+'/deals/'+deal);
  await action(admin,'submitted',{value:'Synthetic Funder A'});
  await action(admin,'submitted',{value:'Synthetic Funder B'});
  const offerForm=admin.locator('form').filter({has:admin.locator('[name=funder]')});
  await fill(offerForm,{funder:'Synthetic Funder A',approval_amount:'21000'});
  await offerForm.locator('button[type=submit]').click();
  await admin.waitForURL(/saved=offer/);
  must(await service.from('offers').insert({deal_id:deal,funder:'Synthetic Funder B',approval_amount:22000}));
  await admin.goto(base+'/deals/'+deal);
  await admin.getByText('Approved, awaiting pitch',{exact:true}).first().waitFor();
  await rep.goto(base+'/deals/'+deal);
  await action(rep,'pitched');
  await admin.reload();
  await action(admin,'contracts_out');
  await action(admin,'contracts_signed');
  const financial=admin.locator('form').filter({has:admin.locator('[name=gross_commission]')});
  await fill(financial,{funded_date:'2026-11-24',funded_amount:'21000',gross_commission:'1200'});
  await financial.locator('button[type=submit]').click();
  await admin.waitForURL(/saved=workflow/);
  const pipeline=admin.locator('form').filter({has:admin.locator('[name=current_stage]')});
  await pipeline.locator('[name=current_stage]').selectOption('Funded');
  await pipeline.locator('button[type=submit]').click();
  await admin.waitForURL(/saved=stage/);
  const entries=must(await service.from('commissions').select('rep_id,commission_amount').eq('deal_id',deal));
  assert.equal(entries.find(e=>e.rep_id===opener.id).commission_amount,420);
  assert.equal(entries.find(e=>e.rep_id===closer.id).commission_amount,180);
  assert.equal(must(await stranger.client.from('commissions').select('id').eq('deal_id',deal)).length,0);
  const kinds=must(await service.from('crm_sales_events').select('kind').eq('deal_id',deal)).map(e=>e.kind);
  assert.equal(kinds.filter(k=>k==='approved').length,1);
  for (const key of ['application_completed','submitted','approved','pitched','contracts_out','contracts_signed','funded']) assert.ok(kinds.includes(key),key);
  await rep.goto(base+'/performance');
  await rep.getByRole('heading',{name:'My performance'}).waitFor();
  await admin.goto(base+'/admin');
  await admin.getByRole('heading',{name:'Sales Performance Center'}).waitFor();
  await admin.getByRole('link',{name:`Sales QA opener ${nonce}`,exact:true}).first().click();
  await admin.getByRole('heading',{name:/Sales QA opener/}).waitFor();
  console.log('PASS browser submission, approval, pitch, contracts, funding, opener and closer commissions, and performance drill-down.');
  const fixtures = [];
  for (let i=0;i<3;i++) {
    const id = i===0 ? randomUUID().replace(/^(........-....-).(...-)./,(_,a,b)=>a+'0'+b+'0') : randomUUID();
    const business_name=`Cleanup QA ${nonce} ${i}`;
    must(await service.from('hot_leads').insert({id,business_name,owner_name:'Synthetic',email:'qa@example.test',phone:'5550100199',assigned_rep_id:third.id,sales_test:true}));
    fixtures.push({id,business_name});
  }
  await admin.goto(base+'/hot-leads?view=active&test=include&q='+nonce);
  await admin.getByRole('checkbox',{name:'Select '+fixtures[0].business_name,exact:true}).check();
  await admin.getByLabel('Lead actions').selectOption('delete');
  await admin.getByRole('button',{name:'Review selection'}).click();
  await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
  await admin.getByText('1 lead deleted.',{exact:true}).waitFor();
  await admin.goto(base+'/hot-leads?view=converted&q='+nonce);
  await admin.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await admin.getByLabel('Lead actions').selectOption('delete');
  await admin.getByRole('button',{name:'Review selection'}).click();
  await admin.getByText('Blocked leads',{exact:true}).waitFor();
  await admin.getByLabel('Lead actions').selectOption('archive');
  await admin.getByRole('button',{name:'Review selection'}).click();
  await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
  await admin.getByText('1 lead archived.',{exact:true}).waitFor();
  assert.equal(must(await service.from('commissions').select('id').eq('deal_id',deal)).length,2);
  await admin.goto(base+'/hot-leads?view=all&q='+nonce);
  await admin.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  for (const f of fixtures.slice(1)) await admin.getByRole('checkbox',{name:'Select '+f.business_name,exact:true}).check();
  await admin.getByLabel('Lead actions').selectOption('delete');
  await admin.getByRole('button',{name:'Review selection'}).click();
  await admin.getByText('Blocked leads',{exact:true}).waitFor();
  await admin.getByRole('button',{name:'Confirm eligible leads only',exact:true}).click();
  await admin.getByText('2 leads deleted.',{exact:true}).waitFor();
  assert.equal(must(await service.from('hot_leads').select('id').in('id',fixtures.map(x=>x.id))).length,0);
  assert.equal(must(await service.from('hot_leads').select('id').eq('id',lead).single()).id,lead);
  console.log('PASS browser single/bulk legacy-ID deletion, protected conversion and archive preservation.');
  const other = await signIn(another.email);
  await other.goto(base+'/hot-leads/new');
  await fill(other,{business_name:`Lost QA ${nonce}`,owner_name:'Synthetic QA',phone:'5550100199',email:'qa@example.test'});
  await other.getByRole('button',{name:/create/i}).click();
  await other.waitForURL(/hot-leads\/[0-9a-f-]+\?created=1/);
  await other.locator('#sales-actions').getByLabel('Sales action').selectOption('lost');
  await other.locator('#sales-actions [name=value]').selectOption('ghosted');
  await other.locator('#sales-actions').getByRole('button',{name:'Save action'}).click();
  await other.getByText('Merchant ghosted',{exact:false}).first().waitFor();
  await action(other,'reopened');
  await other.getByText('Reopened',{exact:true}).waitFor();
  const restoreFixture = must(await service.from('hot_leads').insert({
    business_name:`Follow-up QA ${nonce}`,owner_name:'Synthetic',email:'qa@example.test',
    phone:'5550100199',assigned_rep_id:third.id,owner_profile_id:third.id,
    archived_at:new Date().toISOString(),next_follow_up_date:new Date(Date.now() + 86400000).toISOString(),
  }).select('id,business_name').single());
  const bulk = async (page, operation, name, target) => {
    await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
    await page.getByLabel('Lead actions').selectOption(operation);
    await page.getByRole('button',{name:'Review selection'}).click();
    if (target) await page.getByLabel('Assign to').selectOption(target);
    await page.getByRole('button',{name:'Confirm action',exact:true}).click();
  };
  await admin.goto(base+'/hot-leads?view=archived&q='+nonce);
  await bulk(admin,'restore',restoreFixture.business_name);
  await admin.getByText('1 lead restored.',{exact:true}).waitFor();
  await admin.goto(base+'/hot-leads?q='+nonce);
  await bulk(admin,'reassign',restoreFixture.business_name,opener.id);
  await admin.getByText('1 lead reassigned.',{exact:true}).waitFor();
  const assignments = must(await service.from('hot_leads').select('owner_profile_id,assigned_rep_id').eq('id',restoreFixture.id).single());
  assert.equal(assignments.owner_profile_id,third.id);
  assert.equal(assignments.assigned_rep_id,opener.id);
  console.log('PASS browser restore and reassignment with original owner unchanged.');
  await admin.setViewportSize({width:1440,height:1050});
  await admin.goto(base+'/admin');
  await admin.screenshot({path:join(process.env.QA_SCREENSHOT_DIR ?? '/tmp','crm-sales-performance.png'),fullPage:true});
  await rep.setViewportSize({width:1280,height:900});
  await rep.goto(base+'/dashboard');
  await rep.screenshot({path:join(process.env.QA_SCREENSHOT_DIR ?? '/tmp','crm-rep-action-center.png'),fullPage:true});
  console.log('PASS browser structured loss and reopen. Captured desktop and laptop screenshots.');
  const direct = must(await service.from('deals').insert({
    business_name:`Direct incomplete QA ${nonce}`,owner_name:'Synthetic',email:'qa@example.test',
    phone:'5550100199',assigned_rep_id:third.id
  }).select('id').single());
  const ownerSession = await session(third.email);
  const unuploaded = await ownerSession.client.from('deal_files').insert({
    deal_id:direct.id, file_type:'application',path:direct.id+'/synthetic-absent.pdf',
  });
  assert.match(unuploaded.error?.message ?? '', /Upload the document/);
  const directQueue = must(await service.from('crm_sales_deal_queue').select('queue_stage').eq('id',direct.id).single());
  assert.equal(directQueue.queue_stage,'missing_documents');
  assert.equal(must(await service.from('crm_sales_events').select('id').eq('deal_id',direct.id).eq('kind','application_completed')).length,0);
  await admin.goto(base+'/deals/'+direct.id);
  await admin.locator('#sales-actions').getByLabel('Sales action').selectOption('lost');
  await admin.locator('#sales-actions [name=value]').selectOption('missing_documents');
  await admin.locator('#sales-actions').getByRole('button',{name:'Save action'}).click();
  await admin.locator('#sales-actions').getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await action(admin,'reopened');
  const origin = must(await service.from('hot_leads').insert({
    business_name:`Concurrent conversion QA ${nonce}`,owner_name:'Synthetic',email:'qa@example.test',
    phone:'5550100199',assigned_rep_id:third.id
  }).select('id').single());
  const convert = () => service.from('deals').insert({
    business_name:`Concurrency QA ${nonce}`,owner_name:'Synthetic',email:'qa@example.test',
    phone:'5550100199',assigned_rep_id:third.id,converted_from_hot_lead_id:origin.id
  });
  const concurrent = await Promise.all([convert(),convert()]);
  assert.equal(concurrent.filter(item => !item.error).length,1);
  assert.equal(must(await service.from('deals').select('id').eq('converted_from_hot_lead_id',origin.id)).length,1);
  must(await service.from('deals').update({current_stage:'Funded',gross_commission:1000}).eq('id',direct.id));
  must(await service.from('deals').update({current_stage:'Funded',gross_commission:1000}).eq('id',direct.id));
  const solo = must(await service.from('commissions').select('commission_amount').eq('deal_id',direct.id));
  assert.deepEqual(solo.map(row => row.commission_amount),[500]);
  console.log('PASS direct incomplete application, deal loss and reopen, concurrent conversion, and idempotent solo ledger.');
} finally {
  await browser.close();
}
