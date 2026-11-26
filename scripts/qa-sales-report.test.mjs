import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOpportunities, eventWithin, funnelStages, lastLoss, matchedConversionRows, milestoneMedian, milestonePair, needsHighValueReview, reportDates, stageEntered } from '../lib/sales-report.ts';
import { repDashboardReport } from '../lib/rep-dashboard-report.ts';

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


test('does not turn out-of-order historical milestones into successful conversions', () => {
  const rows = buildOpportunities([], [{id:'historic'}], [
    mkEvent('approval',{deal_id:'historic'},'approved',date(3)),
    mkEvent('submission',{deal_id:'historic'},'submitted',date(5)),
  ], []);
  assert.deepEqual(milestonePair(rows,'submitted','approved',dates),{sample:1,converted:0,rate:0});
  assert.equal(matchedConversionRows(rows,'submitted','approved',dates).converted.length,0);
  assert.deepEqual(milestoneMedian(rows,'submitted','approved',dates),{sample:0,days:null});
});

test('attention uses measured activity and the current stage entry', () => {
  const deals = [
    {id:'stale',queue_stage:'submitted',requested_amount:50_000,submitted_at:date(1)},
    {id:'recent',queue_stage:'submitted',requested_amount:75_000,submitted_at:date(1)},
    {id:'unknown-amount',queue_stage:'submitted',requested_amount:null,submitted_at:date(1)},
    {id:'funded',queue_stage:'funded',requested_amount:75_000,submitted_at:date(1)},
  ];
  const history = [
    mkEvent('first',{deal_id:'stale'},'submitted',date(2)),
    mkEvent('another-funder',{deal_id:'stale'},'submitted',date(4)),
    mkEvent('party',{deal_id:'recent'},'offer_response',date(8)),
  ];
  const rows = buildOpportunities([],deals,history,[]);
  assert.equal(stageEntered(rows[0]),'2026-11-02T18:00:00.000Z');
  assert.equal(stageEntered(rows[1]),null);
  assert.deepEqual(rows.filter(row => needsHighValueReview(row,Date.parse(date(8)))).map(row => row.deal.id),['stale']);
});

test('rep dashboard separates workload, decisions, activity and matched cohorts', () => {
  const deal = (id, queue_stage = 'submitted', extra = {}) => ({
    id, business_name: id, queue_stage, assigned_rep_id: 'rep', ...extra,
  });
  const deals = [
    deal('funded', 'funded', { funded_amount: 21000, archived_at: date(10) }),
    deal('previous-month', 'approved'), deal('pending'), deal('declined', 'lost'),
    deal('new-file', 'processing'), deal('docs', 'stipulations'),
    deal('lost', 'lost'), deal('killed', 'lost'), deal('duplicate', 'lost'),
    deal('synthetic', 'approved', { sales_test: true }),
  ];
  const leads = [
    { id: 'prospect', assigned_rep_id: 'rep', sales_stage: 'waiting_statements', next_follow_up_date: date(2) },
    { id: 'ghosted', assigned_rep_id: 'rep', sales_lost: true },
  ];
  const forDeal = (id, kind, day, extra) => mkEvent(id + kind + day, { deal_id: id }, kind, date(day), extra);
  const events = [
    forDeal('funded', 'application_completed', 1), forDeal('funded', 'submitted', 2),
    forDeal('funded', 'approved', 3), forDeal('funded', 'approved', 4), forDeal('funded', 'funded', 9),
    mkEvent('earlier', { deal_id: 'previous-month' }, 'submitted', '2026-10-28T18:00:00Z'),
    forDeal('previous-month', 'approved', 3),
    forDeal('pending', 'application_completed', 3), forDeal('pending', 'submitted', 4),
    forDeal('pending', 'offer_response', 5, { reason: 'declined' }),
    forDeal('declined', 'submitted', 4), forDeal('declined', 'lost', 6, { reason: 'all_funders_declined' }),
    forDeal('lost', 'lost', 8, { reason: 'competing_offer' }),
    forDeal('killed', 'lost', 8, { reason: 'killed_in_final' }),
    forDeal('duplicate', 'approved', 3), forDeal('duplicate', 'lost', 9, { reason: 'duplicate_invalid' }),
    forDeal('synthetic', 'approved', 3),
    mkEvent('ghosting', { lead_id: 'ghosted' }, 'lost', date(8), { reason: 'ghosted' }),
  ];
  const offer = (deal_id, id, approval_amount, selected_offer_id, status = 'open') => ({
    id, deal_id, status, approval_amount, decision: 'approval', deals: { selected_offer_id },
  });
  const offers = [
    offer('funded', 'selected', 20000, 'selected', 'accepted'), offer('funded', 'higher', 27000, 'selected'),
    offer('previous-month', 'lower', 30000, null), offer('previous-month', 'highest', 35000, null),
    offer('previous-month', 'expired', 50000, null, 'expired'),
  ];
  const ledgerRow = (deal_id, rep_id, commission_amount) => ({ id: deal_id + rep_id, deal_id, rep_id, commission_amount, recognized_at: date(10) });
  const input = {
    rows: buildOpportunities(leads, deals, events, []),
    visibleDealIds: new Set(deals.map(row => row.id)), offers, repId: 'rep', dates,
    ledger: [ledgerRow('funded', 'rep', 420), ledgerRow('hidden-historical', 'rep', 80),
      ledgerRow('funded', 'closer', 180), ledgerRow('synthetic', 'rep', 100)],
  };
  const dashboard = repDashboardReport(input);
  const dealIds = rows => rows.map(row => row.deal?.id);
  assert.equal(dashboard.prospects.length, 1);
  assert.equal(dashboard.waiting.length, 1);
  assert.equal(dashboard.overdue.length, 1);
  assert.deepEqual(dealIds(dashboard.processing), ['pending', 'new-file', 'docs']);
  assert.deepEqual(dealIds(dashboard.waitingOffers), ['pending']);
  assert.deepEqual(dealIds(dashboard.waitingDocuments), ['docs']);
  assert.deepEqual(dealIds(dashboard.awaitingSubmission), ['new-file']);
  assert.deepEqual(dealIds(dashboard.decisionApproved), ['funded', 'previous-month']);
  assert.deepEqual(dealIds(dashboard.decisionDeclined), ['declined']);
  assert.deepEqual(dealIds(dashboard.pending), ['pending']);
  assert.equal(dashboard.conversions.submittedApproval.reached.length, 3);
  assert.equal(dashboard.conversions.submittedApproval.converted.length, 1);
  assert.equal(dashboard.conversions.appApproval.reached.length, 2);
  assert.equal(dashboard.conversions.appApproval.converted.length, 1);
  assert.equal(dashboard.conversions.approvalFunding.converted.length, 1);
  assert.equal(dashboard.conversions.appFunding.converted.length, 1);
  assert.equal(dashboard.approvedVolume, 55000);
  assert.equal(dashboard.fundedVolume, 21000);
  assert.equal(dashboard.earned, 500);
  assert.equal(dashboard.outcomes.length, 5);
  assert.deepEqual(dealIds(dashboard.lost), ['declined', 'lost']);
  assert.equal(dashboard.killed.length, 1);
  assert.equal(dashboard.ghosted.length, 1);
  assert.equal(repDashboardReport({ ...input, offers: null }).approvedVolume, null);
  assert.equal(repDashboardReport({ ...input, offers: offers.slice(1) }).approvedVolume, null);
});
