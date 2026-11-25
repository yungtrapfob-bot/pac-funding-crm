import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { readSalesData } from '@/lib/sales-data';
import { buildOpportunities, eventWithin, firstContactMedian, funnelStages, lastLoss, milestoneMedian, milestonePair, observed, precedingPeriod, reportDates, type Milestone, type SalesOpportunity } from '@/lib/sales-report';
import { dealStages, eventLabels, lossReasons } from '@/lib/sales-labels';
import { formatPacificDate, formatPacificDateTime, pacificDate } from '@/lib/pacific-time';

type Filters = { period?: string; from?: string; to?: string; asOf?: string; cohort?: string; rep?: string; attribution?: string; metric?: string; sort?: string };
type Result = { label: string; value: string | number; rows: SalesOpportunity[] };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percent = (rate: number | null) => rate === null ? 'N/A' : (rate * 100).toFixed(1) + '%';
const isActiveLead = (r: SalesOpportunity) => r.lead && !r.lead.archived_at && !r.lead.converted_at && !r.lead.sales_lost && !r.lead.sales_review;
const isOpenDeal = (r: SalesOpportunity) => r.deal && !['funded','lost'].includes(r.deal.queue_stage);
const followup = (r: SalesOpportunity) => isOpenDeal(r) ? r.deal?.sales_follow_up_at : isActiveLead(r) ? r.lead?.next_follow_up_date : null;
const fields = 'rounded border border-border bg-card px-2 py-1.5';

export async function SalesPerformance({ filters, admin = false }: { filters: Filters; admin?: boolean }) {
  const { profile } = await requireUser();
  const isAdmin = admin && profile.role === 'admin';
  const dates = reportDates(filters);
  const dataset = await readSalesData();
  const population = buildOpportunities(dataset.leads, dataset.deals, dataset.events, dataset.links)
    .filter(row => row.events.filter(e => e.kind === 'lost' || e.kind === 'reopened').at(-1)?.reason !== 'duplicate_invalid');
  const names = new Map(dataset.profiles.map(p => [p.id,p.full_name]));
  const rep = isAdmin && dataset.profiles.some(p => p.id === filters.rep) ? filters.rep : undefined;
  const by = filters.attribution === 'closer' || filters.attribution === 'processor' || filters.attribution === 'assignee'
    ? filters.attribution : 'owner';
  const people = dataset.profiles.filter(p => p.role === 'rep' || p.role === 'admin');
  const scoped = rep ? population.filter(row => row[by] === rep) : population;
  const cohortStart: Milestone = filters.cohort === 'application' ? 'application_completed' : 'lead_created';
  const stages = funnelStages.slice(cohortStart === 'application_completed' ? 1 : 0);
  const cohortFor = (rows: SalesOpportunity[]) => rows.filter(row => !row.issue && eventWithin(row.milestones[cohortStart],dates));
  const cohort = cohortFor(scoped);
  const previous = precedingPeriod(dates);
  const previousCohort = scoped.filter(r => !r.issue && eventWithin(r.milestones[cohortStart],previous));
  const before = milestonePair(previousCohort,'application_completed','approved',previous);
  const recent = milestonePair(cohort,'application_completed','approved',dates);
  const activity = (rows: SalesOpportunity[], milestone: Milestone) => rows.filter(row => eventWithin(row.milestones[milestone],dates));
  const asOfInRange = (time: string) => Date.parse(time) >= Date.parse(dates.start) && Date.parse(time) < Math.min(Date.parse(dates.cutoff),Date.parse(dates.end));
  const ledger = dataset.ledger.filter(row => row.recognized_at && asOfInRange(row.recognized_at) && (!rep || row.rep_id === rep)
    && (isAdmin || profile.id === row.rep_id));
  const eligibleDeals = new Set((isAdmin ? population : scoped).flatMap(row => row.deal ? [row.deal.id] : []));
  const visibleDealIds = new Set(dataset.deals.map(row => row.id));
  const visibleLedger = ledger.filter(r => eligibleDeals.has(r.deal_id) || (!isAdmin && !visibleDealIds.has(r.deal_id)));
  const earned = (rows: typeof visibleLedger) => rows.reduce((sum, row) => sum + Number(row.commission_amount),0);
  const fundedRows = activity(scoped,'funded');
  // Historical amounts are a current snapshot. The ledger is the only source of rep expense.
  const fundedDealIds = new Set(fundedRows.flatMap(r => r.deal ? [r.deal.id] : []));
  const recordedFunded = fundedRows.filter(r => r.deal?.queue_stage === 'funded' && Number(r.deal.funded_amount) > 0);
  const grossKnown = fundedRows.every(r => r.deal?.queue_stage === 'funded' && r.deal.gross_commission != null);
  const gross = fundedRows.reduce((sum,r) => sum + Number(r.deal?.gross_commission ?? 0),0);
  const fundedExpense = dataset.ledger.filter(row => fundedDealIds.has(row.deal_id) && row.recognized_at && Date.parse(row.recognized_at) < Date.parse(dates.cutoff));
  const allHaveLedger = fundedRows.every(r => r.deal && fundedExpense.some(pair => pair.deal_id === r.deal!.id));
  const loss = scoped.filter(row => lastLoss(row,dates));
  const due = scoped.filter(followup);
  const now = Date.now();
  const overdue = due.filter(row => Date.parse(followup(row)!) < now);
  const views = new Map<string,Result>();
  const add = (key: string, label: string, rows: SalesOpportunity[], value: string | number = rows.length) => {
    views.set(key,{label,rows,value}); return key;
  };
  const activityKeys = funnelStages.map(stage => add('activity-' + stage, eventLabels[stage], activity(scoped,stage)));
  activityKeys.push(add('volume','Funded volume',recordedFunded,recordedFunded.length ? money.format(recordedFunded.reduce((sum,r) => sum+Number(r.deal?.funded_amount ?? 0),0)) : 'N/A'));
  activityKeys.push(add('loss','Confirmed losses',loss));
  activityKeys.push(add('ghosted','Ghosted leads',loss.filter(row => row.lead && lastLoss(row,dates)?.reason === 'ghosted')));
  const ledgerIds = new Set(visibleLedger.map(row => row.deal_id));
  activityKeys.push(add('earned',isAdmin ? 'Rep commission ledger' : 'Earned commission',population.filter(row => row.deal && ledgerIds.has(row.deal.id)),money.format(earned(visibleLedger))));
  if (isAdmin && !rep) {
    activityKeys.push(add('gross','Gross earned commission',fundedRows,grossKnown && fundedRows.length ? money.format(gross) : 'N/A'));
    activityKeys.push(add('retained','Company retained commission',fundedRows,grossKnown && allHaveLedger && fundedRows.length ? money.format(gross-earned(fundedExpense)) : 'N/A'));
  }
  const funnelKeys = stages.map(stage => add('cohort-' + stage,eventLabels[stage],cohort.filter(row => observed(row,stage,dates))));
  const agingAnchor = (row: SalesOpportunity) => {
    const events = [...row.events].reverse();
    const kind = ({ approved: 'approved', pitched: 'pitched', contracts_out: 'contracts_out',
      contracts_signed: 'contracts_signed', submitted: 'submitted' } as Record<string,string>)[row.deal?.queue_stage ?? ''];
    return events.find(e => e.kind === kind || (e.kind === 'stage_changed' && e.stage === row.deal?.sales_stage));
  };
  const open = scoped.filter(isOpenDeal);
  const stalledContracts = open.filter(r => {
    const anchor = agingAnchor(r);
    return r.deal?.queue_stage === 'contracts_out' && anchor && Date.parse(anchor.occurred_at) < now-3*86400000;
  });
  const bottlenecks = [
    add('overdue','Overdue follow-ups',overdue), add('followups','Outstanding follow-ups',due),
    add('approved-queue','Approvals awaiting a recorded pitch',open.filter(r => r.deal?.queue_stage === 'approved' && !r.milestones.pitched)),
    add('aged-contracts','Contracts out more than 3 days',stalledContracts),
    add('final-conditions','Unresolved funding conditions',open.filter(r => r.deal?.queue_stage === 'final_conditions' || r.deal?.queue_stage === 'stipulations')),
    add('stalled-apps','Incomplete applications open more than 3 days',open.filter(r => r.deal?.queue_stage === 'missing_documents' && Date.parse(r.deal.submitted_at) < now-3*86400000)),
    add('merchant-response','Merchant considering offer',open.filter(r => r.deal?.queue_stage === 'considering')),
  ];
  const pairs: [Milestone,Milestone][] = [
    ['lead_created','application_completed'],['application_completed','submitted'],['submitted','approved'],
    ['approved','pitched'],['pitched','contracts_out'],['contracts_out','funded'],
    ['application_completed','funded'],['approved','funded'],['lead_created','funded'],['application_completed','approved'],
  ];
  const speedLinks = new Map(pairs.map(([a,b]) => [
    `${a}-${b}`, add(`speed-${a}-${b}`,`${eventLabels[a]} to ${eventLabels[b]}`,cohort.filter(row => {
      const first=observed(row,a,dates), second=observed(row,b,dates);
      return first && second && !first.date_only && !second.date_only && second.occurred_at >= first.occurred_at;
    })),
  ]));
  const detail = filters.metric ? views.get(filters.metric) : undefined;
  const path = isAdmin ? '/admin' : '/performance';
  const url = (patch: Filters) => {
    const params = new URLSearchParams();
    const values = { period: dates.period, from: dates.from, to: dates.to, asOf: dates.asOf, cohort: filters.cohort, rep, attribution: by, sort: filters.sort, ...patch };
    Object.entries(values).forEach(([key,value]) => { if (value) params.set(key,value); });
    return path + '?' + params + (patch.metric ? '#records' : '');
  };
  const lostBreakdown = (field: 'reason' | 'stage' | 'owner' | 'source') => {
    const counts = new Map<string,SalesOpportunity[]>();
    for (const row of loss) {
      const event = lastLoss(row,dates)!;
      const key = field === 'reason' ? event.reason ?? 'Unknown'
        : field === 'stage' ? event.stage ?? 'Unknown'
        : field === 'owner' ? (event.origin_id ? names.get(event.origin_id) ?? 'Unknown' : 'Unassigned')
        : row.source ?? 'Unknown source';
      const list = counts.get(key) ?? [];
      list.push(row); counts.set(key,list);
    }
    return [...counts.entries()].sort((a,b) => b[1].length-a[1].length).map(([key,rows],i) => ({
      key: add(`loss-${field}-${i}`,(field === 'reason' ? lossReasons[key] : field === 'stage' ? (dealStages[key] ?? eventLabels[key]) : key) ?? key,rows),
      count:rows.length,
    }));
  };
  const breakdowns = (['reason','stage','owner','source'] as const).map(field => ({field, items: lostBreakdown(field)}));
  const trend = new Map<string,SalesOpportunity[]>();
  for (const row of loss) {
    const month = pacificDate(lastLoss(row, dates)!.occurred_at).slice(0,7);
    trend.set(month,[...(trend.get(month) ?? []),row]);
  }
  for (const [month, group] of trend) add('loss-month-' + month, month,group);
  const resolvedDetail = filters.metric ? views.get(filters.metric) ?? detail : detail;
  const rows = isAdmin && !rep ? people.map(person => {
    const owned = population.filter(row => row[by] === person.id);
    const group = cohortFor(owned);
    const counts = funnelStages.map(stage => activity(owned,stage).length);
    const volume = activity(owned,'funded').reduce((sum,r) => sum + Number(r.deal?.funded_amount ?? 0),0);
    const fundRate = milestonePair(group,'lead_created','funded',dates).rate;
    const applications = milestonePair(group,'lead_created','application_completed',dates).rate;
    return {person,counts,volume,fundRate,applications,group,
      lost:owned.filter(r => lastLoss(r,dates)).length,
      overdue: owned.filter(r => followup(r) && Date.parse(followup(r)!) < now).length,
      earned:earned(visibleLedger.filter(row => row.rep_id === person.id))};
  }) : [];
  const sortFns: Record<string, (row: typeof rows[number]) => number> = {
    volume:r=>r.volume,funded:r=>r.counts[6],leads:r=>r.counts[0],applications:r=>r.counts[1],
    conversion:r=>r.fundRate ?? -1,overdue:r=>r.overdue,commission:r=>r.earned,
  };
  const sort = Object.hasOwn(sortFns,filters.sort ?? '') ? sortFns[filters.sort!] : sortFns.volume;
  rows.sort((a,b) => sort(b)-sort(a) || a.person.full_name.localeCompare(b.person.full_name));

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold">{isAdmin ? (rep ? names.get(rep) + ' · Performance' : 'Sales Performance Center') : 'My performance'}</h1>
      <Link href="/dashboard" className="text-sm text-primary underline">Daily action center</Link>
    </header>
    <Card>
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Period<select name="period" defaultValue={dates.period} className={fields}>
          <option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="30">Last 30 days</option><option value="custom">Custom range</option>
        </select></label>
        <label className="grid gap-1 text-sm">Custom start<input type="date" name="from" defaultValue={dates.from} className={fields} /></label>
        <label className="grid gap-1 text-sm">Custom end<input type="date" name="to" defaultValue={dates.to} className={fields} /></label>
        <label className="grid gap-1 text-sm">Observe through<input type="date" name="asOf" defaultValue={dates.asOf} className={fields} /></label>
        <label className="grid gap-1 text-sm">Funnel begins at<select name="cohort" defaultValue={filters.cohort === 'application' ? 'application' : 'lead'} className={fields}>
          <option value="lead">Interested lead</option><option value="application">Completed application</option>
        </select></label>
        {isAdmin && <><label className="grid gap-1 text-sm">Rep<select name="rep" defaultValue={rep ?? ''} className={fields}>
          <option value="">Company</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></label><label className="grid gap-1 text-sm">Attribution<select name="attribution" defaultValue={by} className={fields}>
          <option value="owner">Original owner</option><option value="assignee">Current assignee</option><option value="closer">Closer</option><option value="processor">Processor</option>
        </select></label></>}
        <button type="submit" className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">Apply</button>
      </form>
      <p className="mt-2 text-sm text-muted-foreground">{dates.from} through {dates.to} · as of {dates.asOf} · Pacific</p>
      {dates.from > dates.to && <p role="alert" className="text-red-800">The start date must be on or before the end date.</p>}
    </Card>
    <Card className="space-y-3">
      <h2 className="font-semibold">Activity in the selected dates</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {activityKeys.map(key => { const item = views.get(key)!; return <Link key={key} href={url({metric:key})} className="rounded border border-border p-2 text-sm hover:bg-muted/40">
          <p className="text-muted-foreground">{item.label}</p><p className="text-lg font-semibold">{item.value}</p>
        </Link>; })}
      </div>
      {!isAdmin && <Link href="/commissions" className="text-xs text-primary underline">Open full personal ledger</Link>}
      {isAdmin && <p className="text-xs text-muted-foreground">Recognized ledger amounts represent earned commissions. Payment and projection data are unavailable here. Retained commission uses funded deals with known gross amounts and ledger entries.</p>}
    </Card>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Opportunity cohort</h2>
        <p className="text-sm text-muted-foreground">{cohort.length} opportunities entered at {eventLabels[cohortStart].toLowerCase()} during the selected dates. Later events count through the observation date.</p>
        <ol className="space-y-2">
          {funnelKeys.map((key,i) => {
            const stage = stages[i], item = views.get(key)!;
            const count = item.rows.length;
            return <li key={key}><Link href={url({metric:key})} className="block text-sm">
              <div className="flex justify-between gap-2"><span className="text-primary">{item.label}</span><span>{count}
                {i > 0 && <span className="text-muted-foreground"> · {percent(milestonePair(cohort,stages[i-1],stage,dates).rate)} from prior</span>}</span></div>
              <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-primary" style={{width: (cohort.length ? count/cohort.length*100 : 0) + '%'}} /></div>
            </Link></li>;
          })}
        </ol>
        <p className="text-xs text-muted-foreground">Rates use matched opportunities with ordered evidence. Pending opportunities remain in the denominator. Small cohorts can move substantially. A missing milestone is excluded from its rate when a later milestone proves a gap in the record.</p>
        <p className="text-xs text-muted-foreground">{cohort.filter(r => observed(r,'funded',dates)).length} funded · {cohort.filter(r => !observed(r,'funded',dates) && !lastLoss(r,{...dates,start:'0000-01-01',end:dates.cutoff})).length} without a recorded terminal milestone. {scoped.filter(r => r.issue).length} opportunities have an incomplete or ambiguous link in this view.</p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Management attention · current</h2>
        <ul className="divide-y divide-border text-sm">{bottlenecks.map(key => { const item = views.get(key)!; return <li key={key}>
          <Link href={url({metric:key})} className="flex justify-between gap-3 py-2 text-primary">{item.label}<span className="font-semibold">{item.value}</span></Link>
        </li>; })}</ul>
        <p className="text-xs text-muted-foreground">Review the owner and last recorded milestone before assigning follow-up. Aging uses three elapsed days where the starting event exists.</p>
        {recent.sample >= 5 && before.sample >= 5
          ? <p className="text-sm">Application to approval is <Link className="text-primary underline" href={url({metric:'cohort-approved'})}>{percent(recent.rate)} ({recent.converted}/{recent.sample})</Link>
            {' '}versus {percent(before.rate)} ({before.converted}/{before.sample}) in the preceding cohort, {previous.from}–{previous.to}, with equal elapsed observation time.</p>
          : <p className="text-xs text-muted-foreground">At least five measured applications in each period are needed for a comparison.</p>}
      </Card>
    </div>
    <Card>
      <h2 className="mb-2 font-semibold">Conversion and speed</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr><th>Transition</th><th>Matched conversion</th><th>Median elapsed</th></tr></thead>
        <tbody>{pairs.map(([a,b]) => {
          const result = milestonePair(cohort,a,b,dates);
          const speed = milestoneMedian(cohort,a,b,dates);
          return <tr key={`${a}-${b}`} className="border-t border-border"><td className="py-1.5">{eventLabels[a]} → {eventLabels[b]}</td>
            <td>{percent(result.rate)} · {result.converted}/{result.sample}</td><td>{speed.days == null ? 'N/A' : <Link className="text-primary underline"
              href={url({metric:speedLinks.get(`${a}-${b}`)})}>{speed.days.toFixed(1)} d · n={speed.sample}</Link>}</td></tr>;
        })}<tr className="border-t border-border"><td className="py-1.5">Lead created → first recorded contact</td><td>—</td>
          <td>{(() => { const speed=firstContactMedian(cohort,dates); return speed.days == null ? 'N/A' : `${speed.days.toFixed(1)} d · n=${speed.sample}`; })()}</td></tr></tbody>
      </table></div>
    </Card>
    {isAdmin && !rep && <Card>
      <h2 className="mb-2 font-semibold">Rep comparison</h2>
      <div className="mb-2 flex flex-wrap gap-3 text-sm">Sort by {Object.keys(sortFns).map(key => <Link className="text-primary underline" key={key} href={url({sort:key})}>{key}</Link>)}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left"><tr>{['Rep','Leads','Apps','Submitted','Approved','Pitched','Contracts','Funded','Volume','Lead → funded','Lost','Overdue','Earned'].map(label => <th key={label} className="px-2 py-1">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.person.id} className="border-t border-border">
          <td className="px-2 py-1.5"><Link href={url({rep:row.person.id})} className="text-primary underline">{row.person.full_name}</Link>{!row.person.is_active && ' · inactive'}</td>
          {row.counts.map((value,i) => <td key={i} className="px-2">{value}</td>)}
          <td className="px-2">{money.format(row.volume)}</td><td className="px-2">{percent(row.fundRate)}</td><td className="px-2">{row.lost}</td><td className="px-2">{row.overdue}</td><td className="px-2">{money.format(row.earned)}</td>
        </tr>)}</tbody>
      </table></div>
      <details className="mt-3 text-sm"><summary>More rep conversion rates</summary>
        <div className="overflow-x-auto"><table className="mt-2 w-full"><thead className="text-left"><tr>{['Rep','Lead → app','App → approval','Approval → funded','App → funded'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.person.id} className="border-t border-border"><td>{r.person.full_name}</td><td>{percent(r.applications)}</td>
            <td>{percent(milestonePair(r.group,'application_completed','approved',dates).rate)}</td><td>{percent(milestonePair(r.group,'approved','funded',dates).rate)}</td>
            <td>{percent(milestonePair(r.group,'application_completed','funded',dates).rate)}</td></tr>)}</tbody></table></div>
      </details>
    </Card>}
    <Card className="space-y-2">
      <h2 className="font-semibold">Confirmed losses</h2>
      <p className="text-sm text-muted-foreground">Most recent confirmed loss per opportunity, excluding reopened and invalid records.</p>
      {!loss.length ? <p className="text-sm">No confirmed losses in this window.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {breakdowns.map(({field,items}) => <section key={field}><h3 className="text-sm font-medium capitalize">{field === 'owner' ? 'Original rep' : field}</h3><ul className="text-sm">
          {items.map(item => <li key={item.key}><Link className="text-primary underline" href={url({metric:item.key})}>{views.get(item.key)!.label} · {item.count} ({percent(item.count/loss.length)})</Link></li>)}
        </ul></section>)}
      </div>}
      {!!trend.size && <div className="flex flex-wrap gap-3 text-sm"><span>Losses by month</span>
        {[...trend].sort(([a],[b]) => a.localeCompare(b)).map(([month,group]) =>
          <Link key={month} className="text-primary underline" href={url({metric:'loss-month-'+month})}>{month} · {group.length}</Link>)}
      </div>}
    </Card>
    {resolvedDetail && <Card id="records">
      <h2 className="mb-2 font-semibold">{resolvedDetail.label} · {resolvedDetail.rows.length} records</h2>
      {!resolvedDetail.rows.length ? <p className="text-sm text-muted-foreground">No eligible records in this view.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left"><tr>{['Merchant','Stage','Assigned','Origin','Closer','Milestone or due','Outcome','Funded amount'].map(label => <th key={label} className="pr-2">{label}</th>)}</tr></thead>
        <tbody>{resolvedDetail.rows.map(row => {
          const id = row.deal?.id ?? row.lead!.id;
          const stage = row.deal?.queue_stage ?? row.lead?.sales_stage ?? '';
          const metricStage = filters.metric?.replace(/^(activity|cohort)-/,'') as Milestone;
          const milestone = row.milestones[metricStage] ?? (filters.metric?.startsWith('loss') ? lastLoss(row,dates) : undefined);
          const date = milestone ? (milestone.date_only ? formatPacificDate(milestone.occurred_at) : formatPacificDateTime(milestone.occurred_at)) : followup(row) ? formatPacificDateTime(followup(row)!) : '—';
          return <tr key={id} className="border-t border-border"><td className="py-1.5 pr-2"><Link className="text-primary underline" href={(row.deal ? '/deals/' : '/hot-leads/')+id}>{row.deal?.business_name ?? row.lead?.business_name}</Link></td>
            <td>{dealStages[stage] ?? eventLabels[stage] ?? stage}</td>
            {[row.assignee,row.owner,row.closer].map((person,i) => <td key={i}>{person ? names.get(person) ?? '—' : '—'}</td>)}
            <td>{date}</td><td>{stage === 'lost' || row.lead?.sales_lost ? 'Lost' : stage === 'funded' ? 'Funded' : 'Open'}</td><td>{row.deal?.queue_stage === 'funded' && row.deal.funded_amount != null ? money.format(Number(row.deal.funded_amount)) : '—'}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </Card>}
    {isAdmin && <p className="text-sm text-muted-foreground">Review legacy conversion signals in <Link href="/hot-leads?view=review" className="text-primary underline">Needs conversion review</Link>.</p>}
  </div>;
}
