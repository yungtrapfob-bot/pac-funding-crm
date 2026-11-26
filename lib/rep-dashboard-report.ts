import { followUpBucket } from './pacific-time.ts';
import { eventWithin, lastLoss, matchedConversionRows, observed,
  type Milestone, type ReportDates, type SalesOpportunity } from './sales-report.ts';

export type DashboardOffer = {
  id: string;
  deal_id: string;
  status: string;
  decision: string | null;
  approval_amount: number | null;
  deals: { selected_offer_id: string | null };
};
type LedgerEntry = { id: string; deal_id: string; rep_id: string; recognized_at: string | null; commission_amount: number };

export function repDashboardReport({
  rows, visibleDealIds, offers, ledger, repId, dates,
}: {
  rows: SalesOpportunity[];
  visibleDealIds: Set<string>;
  offers: DashboardOffer[] | null;
  ledger: LedgerEntry[];
  repId: string;
  dates: ReportDates;
}) {
  const cutoff = new Date(dates.cutoff);
  const valid = rows.filter(row => row.events.findLast(event => event.occurred_at < dates.cutoff
      && (event.kind === 'lost' || event.kind === 'reopened'))?.reason !== 'duplicate_invalid');
  const eligible = valid.filter(row => !row.issue);
  const activity = (stage: Milestone) => eligible.filter(row => eventWithin(row.milestones[stage], dates));
  const lossThroughCutoff = (row: SalesOpportunity) => lastLoss(row, { ...dates, start: '' });
  const prospects = eligible.filter(({ lead, deal }) => lead?.assigned_rep_id === repId && !deal
    && !lead.archived_at && !lead.converted_at && !lead.sales_lost && !lead.sales_review);
  const due = (bucket: 'today' | 'overdue') => prospects.filter(({ lead }) => lead?.next_follow_up_date
    && followUpBucket(lead.next_follow_up_date, cutoff, lead.created_at) === bucket);
  const processing = eligible.filter(row => row.deal?.assigned_rep_id === repId && !row.deal.archived_at
    && !row.deal.sales_lost && ['processing', 'submitted', 'underwriting', 'stipulations', 'missing_documents'].includes(row.deal.queue_stage)
    && !observed(row, 'approved', dates) && !lossThroughCutoff(row));
  const awaitingSubmission = (row: SalesOpportunity) => row.deal?.queue_stage === 'processing'
    || (row.deal?.queue_stage === 'missing_documents' && row.deal.has_documents);

  const applications = activity('application_completed');
  const approvals = activity('approved');
  const funded = activity('funded');
  const decisionApproved = approvals.filter(row => row.deal && row.milestones.submitted
    && row.milestones.submitted.occurred_at <= row.milestones.approved!.occurred_at);
  const decisionDeclined = eligible.filter(row => {
    const loss = lastLoss(row, dates);
    return row.deal && loss?.reason === 'all_funders_declined' && row.milestones.submitted
      && row.milestones.submitted.occurred_at <= loss.occurred_at && !decisionApproved.includes(row);
  });
  const conversions = {
    submittedApproval: matchedConversionRows(activity('submitted'), 'submitted', 'approved', dates),
    appApproval: matchedConversionRows(applications, 'application_completed', 'approved', dates),
    approvalFunding: matchedConversionRows(approvals, 'approved', 'funded', dates),
    appFunding: matchedConversionRows(applications, 'application_completed', 'funded', dates),
  };
  const pending = conversions.submittedApproval.reached.filter(row => !observed(row, 'approved', dates)
    && !observed(row, 'funded', dates) && !lossThroughCutoff(row) && !row.deal?.sales_lost
    && !['lost', 'funded'].includes(row.deal?.queue_stage ?? ''));
  const losses = eligible.filter(row => !funded.includes(row) && lastLoss(row, dates));
  const killed = losses.filter(row => lastLoss(row, dates)?.reason === 'killed_in_final');
  const ghosted = losses.filter(row => lastLoss(row, dates)?.reason === 'ghosted');

  const approvalAmounts = new Map<string, { selected: number | null; highest: number | null; hasSelection: boolean }>();
  for (const offer of offers ?? []) {
    const summary = approvalAmounts.get(offer.deal_id) ?? { selected: null, highest: null, hasSelection: false };
    approvalAmounts.set(offer.deal_id, summary);
    const selectedId = offer.deals.selected_offer_id;
    summary.hasSelection ||= Boolean(selectedId);
    const amount = Number(offer.approval_amount);
    if (!['open', 'accepted'].includes(offer.status) || offer.decision === 'decline' || !Number.isFinite(amount) || amount <= 0) continue;
    summary.highest = Math.max(summary.highest ?? 0, amount);
    if (offer.id === selectedId) summary.selected = amount;
  }
  const amounts = approvals.map(({ deal }) => deal && approvalAmounts.get(deal.id));
  const approvedVolume = amounts.every(amount => amount && (amount.hasSelection ? amount.selected : amount.highest) !== null)
    ? amounts.reduce((sum, amount) => sum + (amount ? (amount.hasSelection ? amount.selected : amount.highest) ?? 0 : 0), 0) : null;
  const fundedVolume = funded.every(({ deal }) => deal?.queue_stage === 'funded' && Number(deal.funded_amount) > 0)
    ? funded.reduce((sum, { deal }) => sum + Number(deal?.funded_amount), 0) : null;
  const reportDeals = new Map(valid.flatMap(row => row.deal ? [[row.deal.id, row.deal] as const] : []));
  const earnings = ledger.filter(row => row.recognized_at && row.rep_id === repId
    && Date.parse(row.recognized_at) >= Date.parse(dates.start)
    && Date.parse(row.recognized_at) < Math.min(Date.parse(dates.end), Date.parse(dates.cutoff))
    && (reportDeals.has(row.deal_id) || !visibleDealIds.has(row.deal_id)))
    .map(row => ({ ...row, deal: reportDeals.get(row.deal_id) }));

  return {
    prospects, waiting: prospects.filter(({ lead }) => lead?.sales_stage !== 'interested'),
    dueToday: due('today'), overdue: due('overdue'),
    processing, awaitingSubmission: processing.filter(awaitingSubmission),
    waitingOffers: processing.filter(row => ['submitted', 'underwriting'].includes(row.deal?.queue_stage ?? '')),
    waitingDocuments: processing.filter(row => ['missing_documents', 'stipulations'].includes(row.deal?.queue_stage ?? '') && !awaitingSubmission(row)),
    decisions: [...decisionApproved, ...decisionDeclined], decisionApproved, decisionDeclined, pending,
    outcomes: [...funded, ...losses], funded, killed, ghosted,
    lost: losses.filter(row => !killed.includes(row) && !ghosted.includes(row)),
    applications, approvals, approvedVolume, fundedVolume, earnings,
    earned: earnings.reduce((sum, row) => sum + Number(row.commission_amount), 0),
    conversions,
  };
}
