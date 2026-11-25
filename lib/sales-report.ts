import { pacificDate, parsePacificInput } from './pacific-time.ts';

export const funnelStages = ['lead_created','application_completed','submitted','approved','pitched','contracts_out','funded'] as const;
export type Milestone = (typeof funnelStages)[number];

export type SalesEvent = {
  id: string; lead_id: string | null; deal_id: string | null; kind: string; occurred_at: string;
  origin_id: string | null; assigned_id: string | null; closer_id: string | null; processor_id: string | null;
  stage: string | null; reason: string | null; date_only: boolean;
};

export type SalesLead = {
  id: string; business_name: string; assigned_rep_id: string | null; owner_profile_id: string | null;
  sales_source: string | null; sales_stage: string; sales_test: boolean; sales_lost: boolean; sales_review: boolean;
  archived_at: string | null; converted_at: string | null; next_follow_up_date: string | null; last_contact_date: string | null;
};

export type SalesDeal = {
  archived_at?: string | null;
  id: string; business_name: string; assigned_rep_id: string | null; owner_profile_id: string | null; closer_rep_id: string | null;
  sales_processor_id: string | null; sales_stage: string | null; sales_source: string | null; current_stage: string; queue_stage: string; sales_test: boolean; sales_lost: boolean;
  converted_from_hot_lead_id: string | null; submitted_at: string; sales_follow_up_at: string | null; sales_next_action: string | null;
  requested_amount: number | null; funded_amount: number | null; gross_commission: number | null; has_documents: boolean;
};

export type SalesOpportunity = {
  lead?: SalesLead; deal?: SalesDeal; events: SalesEvent[];
  milestones: Partial<Record<Milestone, SalesEvent>>;
  owner: string | null; assignee: string | null; closer: string | null; processor: string | null;
  source: string | null; issue: boolean;
};

export interface ReportDates {
  from: string; to: string; asOf: string; start: string; end: string; cutoff: string; period: string;
}
const DAY = 86_400_000;
export const salesAttentionDays = 3;
export const highValueRequest = 50_000;
const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
const shiftDate = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const isDate = (value?: string) => Boolean(value && dateFormat.test(value) && parsePacificInput(value + 'T00:00'));
const midnight = (date: string) => parsePacificInput(date + 'T00:00')!;

export function reportDates(params: { period?: string; from?: string; to?: string; asOf?: string }, now = new Date()): ReportDates {
  const today = pacificDate(now);
  let period = params.period ?? 'month';
  if (!['today','week','month','30','custom'].includes(period)) period = 'month';
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  const defaults: Record<string, string> = { today, week: shiftDate(today, -((weekday + 6) % 7)), month: today.slice(0,7) + '-01', '30': shiftDate(today, -29) };
  const from = period === 'custom' && isDate(params.from) ? params.from! : defaults[period] ?? defaults.month;
  const to = period === 'custom' && isDate(params.to) ? params.to! : today;
  const asOf = isDate(params.asOf) && params.asOf! < today ? params.asOf! : today;
  return { period, from, to, asOf, start: midnight(from), end: midnight(shiftDate(to, 1)),
    cutoff: asOf === today ? now.toISOString() : midnight(shiftDate(asOf, 1)) };
}

export function precedingPeriod(dates: ReportDates): ReportDates {
  const span = Math.max(1, (Date.parse(dates.to)-Date.parse(dates.from))/DAY+1);
  const from = shiftDate(dates.from,-span), to = shiftDate(dates.from,-1);
  const start = midnight(from), end = midnight(dates.from);
  const observedElapsed = Date.parse(dates.cutoff)-Date.parse(dates.start);
  const cutoff = new Date(Date.parse(start)+observedElapsed).toISOString();
  return { ...dates, from,to,start,end,cutoff,asOf:pacificDate(cutoff) };
}

export function buildOpportunities(
  leads: SalesLead[], deals: SalesDeal[], events: SalesEvent[],
  historicalLinks: { hot_lead_id: string; deal_id: string }[],
): SalesOpportunity[] {
  const byLead = new Map(leads.map(lead => [lead.id, lead]));
  const linkedDeals = new Map<string, Set<string>>();
  const linkedLeads = new Map<string, Set<string>>();
  const link = (lead: string, deal: string) => {
    if (!linkedDeals.has(lead)) linkedDeals.set(lead, new Set());
    linkedDeals.get(lead)!.add(deal);
    if (!linkedLeads.has(deal)) linkedLeads.set(deal, new Set());
    linkedLeads.get(deal)!.add(lead);
  };
  for (const deal of deals) if (deal.converted_from_hot_lead_id) link(deal.converted_from_hot_lead_id, deal.id);
  const dealIds = new Set(deals.map(deal => deal.id));
  for (const row of historicalLinks) if (dealIds.has(row.deal_id)) link(row.hot_lead_id,row.deal_id);

  const eventsByRecord = new Map<string, SalesEvent[]>();
  for (let event of events) {
    event = { ...event, occurred_at: new Date(event.occurred_at).toISOString() };
    const key = event.deal_id ? 'd' + event.deal_id : 'l' + event.lead_id;
    const list = eventsByRecord.get(key) ?? [];
    list.push(event); eventsByRecord.set(key,list);
  }
  const used = new Set<string>();
  const rows: SalesOpportunity[] = [];
  function add(lead?: SalesLead, deal?: SalesDeal, issue = false) {
    if (lead?.sales_test || deal?.sales_test) return;
    const history = [...(lead ? eventsByRecord.get('l' + lead.id) ?? [] : []),
      ...(deal ? eventsByRecord.get('d' + deal.id) ?? [] : [])]
      .sort((a,b) => Date.parse(a.occurred_at)-Date.parse(b.occurred_at) || a.id.localeCompare(b.id));
    const milestones: SalesOpportunity['milestones'] = {};
    for (const event of history) if (funnelStages.includes(event.kind as Milestone)) {
      milestones[event.kind as Milestone] ??= event;
    }
    rows.push({
      lead,deal,events:history,milestones,issue,
      owner: milestones.lead_created?.origin_id ?? deal?.owner_profile_id ?? lead?.owner_profile_id ?? deal?.assigned_rep_id ?? lead?.assigned_rep_id ?? null,
      assignee: deal?.assigned_rep_id ?? lead?.assigned_rep_id ?? null, closer: deal?.closer_rep_id ?? null,
      processor: deal?.sales_processor_id ?? null, source: deal?.sales_source ?? lead?.sales_source ?? null,
    });
  }
  for (const deal of deals) {
    const sameDeal = linkedLeads.get(deal.id);
    const linkedId = sameDeal?.size === 1 ? [...sameDeal][0] : undefined;
    const unique = linkedId && linkedDeals.get(linkedId)?.size === 1;
    const lead = unique ? byLead.get(linkedId) : undefined;
    if (lead) used.add(lead.id);
    add(lead, deal, Boolean(sameDeal?.size && !unique));
  }
  for (const lead of leads) if (!used.has(lead.id)) {
    add(lead, undefined, Boolean(lead.sales_review || lead.converted_at || (linkedDeals.get(lead.id)?.size ?? 0) > 1));
  }
  return rows;
}

export function eventWithin(event: SalesEvent | undefined, dates: ReportDates) {
  if (!event || event.occurred_at >= dates.cutoff) return false;
  return event.occurred_at >= dates.start && event.occurred_at < dates.end;
}
export function observed(row: SalesOpportunity, stage: Milestone, dates: ReportDates) {
  const event = row.milestones[stage];
  return event && event.occurred_at < dates.cutoff ? event : undefined;
}

export function matchedConversionRows(rows: SalesOpportunity[], first: Milestone, second: Milestone, dates: ReportDates) {
  const secondIndex = funnelStages.indexOf(second);
  const reached = rows.filter(row => observed(row, first, dates)).filter(row => (
    observed(row, second, dates) ||
    !funnelStages.slice(secondIndex + 1).some(later => observed(row, later, dates))
  ));
  const converted = reached.filter(row => {
    const a = observed(row, first, dates)!;
    const b = observed(row, second, dates);
    return b && b.occurred_at >= a.occurred_at;
  });
  return { reached, converted };
}

export function milestonePair(rows: SalesOpportunity[], first: Milestone, second: Milestone, dates: ReportDates) {
  const { reached, converted } = matchedConversionRows(rows, first, second, dates);
  return { sample: reached.length, converted: converted.length, rate: reached.length ? converted.length / reached.length : null };
}

export function lastDealActivity(row: SalesOpportunity) {
  const deal = row.deal;
  if (!deal) return null;
  const event = row.events.findLast(event => event.deal_id === deal.id && !event.date_only);
  return event && Date.parse(event.occurred_at) > Date.parse(deal.submitted_at) ? event.occurred_at : deal.submitted_at;
}

export function stageEntered(row: SalesOpportunity) {
  const deal = row.deal;
  if (!deal) return null;
  if (deal.queue_stage === 'missing_documents') return deal.submitted_at;
  const milestone = ({ processing: 'application_completed', submitted: 'submitted', approved: 'approved',
    pitched: 'pitched', contracts_out: 'contracts_out', contracts_signed: 'contracts_signed' } as Record<string, string>)[deal.queue_stage];
  const stage = deal.sales_stage ?? deal.current_stage;
  const first = row.events.find(event => event.deal_id === deal.id && event.kind === milestone);
  const entry = row.events.findLast(event => event.deal_id === deal.id && (
    event.kind === 'reopened' || (event.kind === 'stage_changed' && event.stage === stage)
    || event === first
  ));
  return entry && !entry.date_only ? entry.occurred_at : null;
}

export function needsHighValueReview(row: SalesOpportunity, now: number) {
  if (!row.deal || row.deal.archived_at || ['funded', 'lost'].includes(row.deal.queue_stage) || !(Number(row.deal.requested_amount) >= highValueRequest)) return false;
  const activity = lastDealActivity(row);
  return Boolean(activity && now - Date.parse(activity) > salesAttentionDays * DAY);
}

export function firstContactMedian(rows: SalesOpportunity[], dates: ReportDates) {
  return median(rows.flatMap(row => {
    const start = observed(row, 'lead_created', dates);
    if (!start || start.date_only) return [];
    const end = row.events.find(e => ['call','text','email'].includes(e.kind) && (e.kind !== 'call' || !e.reason || ['spoke','callback_requested'].includes(e.reason)) && e.occurred_at >= start.occurred_at && e.occurred_at < dates.cutoff);
    return end ? [(Date.parse(end.occurred_at)-Date.parse(start.occurred_at))/DAY] : [];
  }));
}

function median(values: number[]) {
  values.sort((a,b) => a-b);
  const middle = Math.floor(values.length / 2);
  return { sample: values.length, days: values.length === 0 ? null : values.length % 2 ? values[middle] : (values[middle-1]+values[middle])/2 };
}

export function milestoneMedian(rows: SalesOpportunity[], first: Milestone, second: Milestone, dates: ReportDates) {
  return median(rows.flatMap(row => {
    const a = observed(row, first, dates);
    const b = observed(row, second, dates);
    return a && b && !a.date_only && !b.date_only && b.occurred_at >= a.occurred_at
      ? [(Date.parse(b.occurred_at)-Date.parse(a.occurred_at))/DAY] : [];
  }));
}

export function lastLoss(row: SalesOpportunity, dates: ReportDates) {
  // A later reopen clears the current loss, but the timeline keeps the old event.
  const latest = row.events.filter(e => (e.kind === 'lost' || e.kind === 'reopened' || e.kind === 'funded') && e.occurred_at < dates.cutoff).at(-1);
  return latest?.kind === 'lost' && latest.reason !== 'duplicate_invalid' && eventWithin(latest, dates) ? latest : undefined;
}
