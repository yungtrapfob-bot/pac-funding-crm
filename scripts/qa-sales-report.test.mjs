import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOpportunities, eventWithin, funnelStages, lastLoss, milestoneMedian, milestonePair, reportDates } from '../lib/sales-report.ts';

const date = (day) => '2026-11-' + String(day).padStart(2,'0') + 'T18:00:00Z';
const mkEvent = (id, record, kind, occurred_at, extra = {}) => ({
  id, lead_id: null, deal_id: null, ...record, kind, occurred_at,
  origin_id: 'opener', assigned_id: 'new-rep', closer_id: 'closer', processor_id: null,
  stage: null, reason: null, date_only: false, ...extra,
});
const dates = reportDates({period:'custom',from:'2026-11-01',to:'2026-11-30'},new Date('2026-12-10T02:00:00Z'));

test('reports an independently calculated cohort with duplicates and funding next month', () => {
  const counts = [100,40,30,24,20,12,8];
  const leads = Array.from({length:100}, (_, i) => ({id:`lead-${i}`, owner_profile_id:'opener',assigned_rep_id:'new-rep'}));
  const deals = leads.slice(0,40).map((lead,i) => ({id:`deal-${i}`, converted_from_hot_lead_id:lead.id, closer_rep_id:'closer'}));
  const events = funnelStages.flatMap((stage,j) => Array.from({length:counts[j]},(_,i) => mkEvent(
    `${stage}-${i}`, j === 0 ? {lead_id:`lead-${i}`} : {deal_id:`deal-${i}`}, stage,
    j === 6 ? '2026-12-02T15:00:00Z' : date(j+1))));
  events.push(mkEvent('extra approval',{deal_id:'deal-2'},'approved',date(19)));
  const opportunities = buildOpportunities(leads,deals,events,[]);
  assert.equal(opportunities.length,100);
  const rows = opportunities.filter(r => eventWithin(r.milestones.lead_created,dates));
  for (let j=1;j<counts.length;j++) {
    assert.deepEqual(milestonePair(rows,funnelStages[j-1],funnelStages[j],dates),
      {sample:counts[j-1],converted:counts[j],rate:counts[j]/counts[j-1]});
  }
  assert.equal(milestonePair(rows,'lead_created','funded',dates).rate,.08);
  assert.equal(milestonePair(rows,'application_completed','funded',dates).rate,.20);
  assert.equal(milestonePair(rows,'approved','funded',dates).rate,1/3);
  assert.ok(rows.every(r => r.owner === 'opener'));
  assert.equal(eventWithin(rows[0].milestones.funded,dates),false);
});

test('direct applications, time boundaries, losses, and unknown data use explicit evidence', () => {
  const deals = [{id:'direct'},{id:'legacy'}];
  const records = [
    mkEvent('doc',{deal_id:'direct'},'application_completed','2026-11-01T07:00:00+00:00'),
    mkEvent('loss',{deal_id:'direct'},'lost',date(4),{reason:'ghosted'}),
    mkEvent('reopen',{deal_id:'direct'},'reopened',date(5)),
    mkEvent('funded',{deal_id:'direct'},'funded',date(11),{date_only:true}),
  ];
  const rows = buildOpportunities([],deals,records,[]);
  assert.equal(rows.length,2);
  assert.equal(eventWithin(rows[0].milestones.application_completed,dates),true);
  assert.equal(milestonePair(rows,'lead_created','funded',dates).rate,null);
  assert.equal(milestonePair(rows,'application_completed','funded',dates).rate,1);
  assert.deepEqual(milestoneMedian(rows,'application_completed','funded',dates),{sample:0,days:null});
  assert.equal(lastLoss(rows[0],dates),undefined);
  assert.equal(lastLoss(rows[0],reportDates({period:'custom',from:'2026-11-01',to:'2026-11-30',asOf:'2026-11-04'},new Date('2026-12-10')))?.reason,'ghosted');
  assert.equal(dates.start,'2026-11-01T07:00:00.000Z');
  assert.equal(dates.end,'2026-12-01T08:00:00.000Z');
});

test('conflicting conversion links are surfaced rather than attributed by merchant name', () => {
  const rows = buildOpportunities([{id:'lead',converted_at:date(1)}],
    [{id:'deal-a',converted_from_hot_lead_id:'lead'},{id:'deal-b'}],[],
    [{hot_lead_id:'lead',deal_id:'deal-b'}]);
  assert.ok(rows.every(row => row.issue));
  assert.ok(rows.every(row => !row.lead || !row.deal));
});
