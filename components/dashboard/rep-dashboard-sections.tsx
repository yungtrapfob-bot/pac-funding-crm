import Link from 'next/link';
import { buildOpportunities, eventWithin, type ReportDates, type SalesOpportunity } from '@/lib/sales-report';
import { repDashboardReport, type DashboardOffer } from '@/lib/rep-dashboard-report';
import { readSalesData } from '@/lib/sales-data';
import { createClient } from '@/lib/supabase/server';
import { readPages } from '@/lib/supabase/read-pages';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const grid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';
const tones = [
  'border-emerald-200 bg-emerald-50 text-emerald-950',
  'border-sky-200 bg-sky-50 text-sky-950',
  'border-amber-200 bg-amber-50 text-amber-950',
  'border-violet-200 bg-violet-50 text-violet-950',
];
type RecordLink = { id: string; name: string; href?: string; detail?: string };
type Metric = { id: string; label: string; value: string | number; rows: RecordLink[]; explanation?: string };
type MetricCard = { total: Metric; details: Metric[]; conversion?: Metric };

function opportunityLinks(rows: SalesOpportunity[]): RecordLink[] {
  return rows.flatMap(({ deal, lead }) => {
    const record = deal ?? lead;
    return record ? [{ id: record.id, name: record.business_name, href: (deal ? '/deals/' : '/hot-leads/') + record.id }] : [];
  });
}

export async function RepDashboardSections({ repId, dates, filters }: {
  repId: string;
  dates: ReportDates;
  filters: { followups?: string; all?: string; records?: string };
}) {
  let dataset: Awaited<ReturnType<typeof readSalesData>>;
  try {
    dataset = await readSalesData();
  } catch {
    return <p role="status" className="rounded-lg border border-border bg-card p-3 text-sm">
      Pipeline and performance details are unavailable. Refresh to try again.
    </p>;
  }

  const rows = buildOpportunities(dataset.leads, dataset.deals, dataset.events, dataset.links);
  const approvedIds = [...new Set(rows.flatMap(row => row.deal && eventWithin(row.milestones.approved, dates) ? [row.deal.id] : []))];
  const supabase = await createClient();
  let offers: DashboardOffer[] | null = [];
  try {
    // Keep the PostgREST filter URL bounded even in a high-volume month.
    for (let offset = 0; offset < approvedIds.length; offset += 100) {
      offers.push(...await readPages<DashboardOffer>((from, to) => supabase.from('offers')
        .select('id,deal_id,status,decision,approval_amount,deals!offers_deal_id_fkey(selected_offer_id)')
        .in('deal_id', approvedIds.slice(offset, offset + 100)).order('id').range(from, to)
        .overrideTypes<DashboardOffer[], { merge: false }>()));
    }
  } catch {
    offers = null;
  }

  const report = repDashboardReport({ rows, dates, offers, ledger: dataset.ledger, repId,
    visibleDealIds: new Set(dataset.deals.map(deal => deal.id)) });
  const { conversions } = report;
  const metric = (id: string, label: string, records: SalesOpportunity[], value: string | number = records.length): Metric => ({
    id, label, value, rows: opportunityLinks(records),
  });
  const rate = (id: string, label: string, { reached, converted }: typeof conversions.appApproval): Metric => ({
    ...metric(id, label, reached, reached.length ? `${Math.round(converted.length / reached.length * 100)}%` : 'N/A'),
    explanation: reached.length ? `${converted.length} of ${reached.length} eligible opportunities reached the next milestone.` : 'No eligible starting milestones were recorded this month.',
  });
  const volume = (amount: number | null) => amount === null ? 'N/A' : money.format(amount);

  const pipeline: (MetricCard & { period: string })[] = [
    { period: 'Current workload', total: metric('prospects', 'Interested leads', report.prospects), details: [
      metric('waiting', 'Waiting on app / statements', report.waiting),
      metric('today', 'Follow-ups due today', report.dueToday),
      metric('overdue', 'Overdue follow-ups', report.overdue),
    ] },
    { period: 'Current workload', total: metric('processing', 'Processing', report.processing), details: [
      metric('waiting-offers', 'Waiting on offers', report.waitingOffers),
      metric('waiting-docs', 'Waiting on additional docs', report.waitingDocuments),
      metric('awaiting-submission', 'Awaiting submission', report.awaitingSubmission),
    ] },
    { period: 'This month', total: metric('decisions', 'Decisions', report.decisions), details: [
      metric('decision-approved', 'Approved', report.decisionApproved),
      metric('decision-declined', 'Declined', report.decisionDeclined),
      metric('pending', 'Pending from this month’s submissions', report.pending),
    ], conversion: rate('submitted-approval', 'Submitted-to-approval', conversions.submittedApproval) },
    { period: 'This month', total: metric('outcomes', 'Final outcomes', report.outcomes), details: [
      metric('funded', 'Funded', report.funded),
      metric('killed', 'Killed in final', report.killed),
      metric('lost', 'Lost', report.lost),
      metric('ghosted', 'Ghosting', report.ghosted),
    ] },
  ];
  const earned: Metric = {
    id: 'earned', label: 'Earned commission', value: money.format(report.earned),
    rows: report.earnings.map(({ id, deal, commission_amount }) => ({
      id, name: deal?.business_name ?? 'Commission entry',
      href: deal ? '/deals/' + deal.id : undefined, detail: money.format(commission_amount),
    })),
  };
  const performance: MetricCard[] = [
    { total: metric('applications', 'Completed applications', report.applications), details: [] },
    { total: metric('approved-volume', 'Approved volume', report.approvals, volume(report.approvedVolume)), details: [
      metric('approved-units', 'Approved units', report.approvals),
      rate('app-approval', 'App-to-approval', conversions.appApproval),
    ] },
    { total: metric('funded-volume', 'Funded volume', report.funded, volume(report.fundedVolume)), details: [
      metric('funded-units', 'Funded units', report.funded),
      rate('approval-funding', 'Approval-to-funding', conversions.approvalFunding),
    ] },
    { total: earned, details: [rate('app-funding', 'App-to-funding', conversions.appFunding)] },
  ];

  const bars = [
    metric('applications', 'Applications', report.applications),
    metric('approved-units', 'Approved', report.approvals),
    metric('funded-units', 'Funded', report.funded),
  ];
  const barScale = Math.max(1, ...bars.map(bar => bar.rows.length));
  const href = (id?: string) => {
    const params = new URLSearchParams();
    if (typeof filters.followups === 'string') params.set('followups', filters.followups);
    if (typeof filters.all === 'string') params.set('all', filters.all);
    if (id) params.set('records', id);
    return '/dashboard' + (params.size ? '?' + params : '') + (id ? '#dashboard-records' : '#rep-pipeline');
  };
  const detail = [...pipeline, ...performance]
    .flatMap(card => [card.total, ...card.details, ...(card.conversion ? [card.conversion] : [])])
    .find(item => item.id === filters.records);
  const detailLine = (item: Metric) => <Link key={item.id} href={href(item.id)}
    className="flex items-baseline justify-between gap-2 py-0.5 text-xs hover:underline"
    aria-label={`${item.label}, ${item.value}. View records.`}>
    <span>{item.label}</span><span className="shrink-0 font-semibold tabular-nums">{item.value}</span>
  </Link>;

  return <>
    <section id="rep-pipeline" aria-labelledby="rep-pipeline-heading" className="space-y-2">
      <h2 id="rep-pipeline-heading" className="font-semibold">Active pipeline</h2>
      <div className={grid} data-testid="rep-pipeline-cards">
        {pipeline.map(({ period, total, details, conversion }, index) =>
          <article key={total.id} className={`rounded-lg border p-3 ${tones[index]}`}>
            <p className="text-xs font-medium opacity-80">{period}</p>
            <Link href={href(total.id)} className="mt-0.5 block w-fit hover:underline">
              <h3 className="text-sm font-semibold">{total.label}</h3>
              <p className="text-3xl font-bold leading-tight tabular-nums">{total.value}</p>
            </Link>
            {conversion && <Link href={href(conversion.id)} className="mt-1 inline-flex items-baseline gap-2 rounded bg-white/70 px-2 py-1 text-xs hover:underline">
              <span className="text-base font-bold tabular-nums">{conversion.value}</span>{conversion.label}
            </Link>}
            <div className="mt-2 space-y-0.5 border-t border-current/15 pt-1.5">{details.map(detailLine)}</div>
          </article>)}
      </div>
      <p className="text-xs text-muted-foreground">Lead follow-ups overlap with the interested total. The approval rate uses this month’s submissions.</p>
    </section>

    <section aria-labelledby="rep-performance-heading" className="space-y-2">
      <h2 id="rep-performance-heading" className="font-semibold">My performance this month</h2>
      <div className={grid} data-testid="rep-performance-cards">
        {performance.map(({ total, details }) => <article key={total.id} className="rounded-lg border border-border bg-card p-3">
          <Link href={href(total.id)} className="block w-fit hover:underline">
            <h3 className="text-xs font-medium text-muted-foreground">{total.label}</h3>
            <p className="mt-1 text-2xl font-bold leading-tight tabular-nums">{total.value}</p>
          </Link>
          <div className="mt-1">{details.map(detailLine)}</div>
        </article>)}
      </div>
      <div className="rounded-lg border border-border bg-card px-3 py-2">
        <h3 className="mb-1 text-xs font-medium">Month-to-date activity</h3>
        <div className="space-y-1">
          {bars.map(bar => <Link href={href(bar.id)} key={bar.id} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs hover:underline">
            <span>{bar.label}</span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-emerald-100">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${bar.rows.length / barScale * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{bar.value}</span>
          </Link>)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Rates follow opportunities that reached the starting milestone this month.</p>
    </section>

    {detail && <section id="dashboard-records" aria-labelledby="dashboard-records-heading" className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="dashboard-records-heading" className="font-semibold">{detail.label} records</h2>
        <Link href={href()} className="text-sm text-primary hover:underline">Close records</Link>
      </div>
      {detail.explanation && <p className="mt-1 text-sm text-muted-foreground">{detail.explanation}</p>}
      {!detail.rows.length ? <p className="mt-2 text-sm text-muted-foreground">No records in this view.</p>
        : <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto text-sm">
          {detail.rows.map(row => <li key={row.id} className="flex justify-between gap-3 py-1.5">
            {row.href ? <Link href={row.href} className="text-primary hover:underline">{row.name}</Link> : <span>{row.name}</span>}
            {row.detail && <span className="tabular-nums">{row.detail}</span>}
          </li>)}
        </ul>}
    </section>}
  </>;
}
