import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { formatPacificFollowUp, pacificDate } from '@/lib/pacific-time';
import { dealQueueGroups, dealStages, leadStages } from '@/lib/sales-labels';
import { createClient } from '@/lib/supabase/server';
import { reportDates } from '@/lib/sales-report';
import { readPages } from '@/lib/supabase/read-pages';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
type MonthlyMilestone = { id: string; deal_id: string; kind: string; deals: { funded_amount: number | null; current_stage: string } };
type MonthlyLedger = { id: string; commission_amount: number; deals: { sales_test: boolean } | null };

const followUpFilters = { due: 'All due', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming' } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ followups?: string; all?: string }> }) {
  const filters = await searchParams;
  const filter = filters.followups && Object.hasOwn(followUpFilters, filters.followups)
    ? filters.followups as keyof typeof followUpFilters : 'due';
  const { profile } = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';
  const now = new Date().toISOString();
  const month = reportDates({ period: 'month' }, new Date(now));
  const [leads, deals, production, ledger] = await Promise.all([
    readPages((from,to) => supabase.from('hot_leads')
      .select('id,business_name,sales_stage,next_follow_up_date,last_contact_date,notes,assigned_rep_id')
      .is('archived_at',null).is('converted_at',null).eq('sales_lost',false).eq('sales_review',false).eq('sales_test',false)
      .eq(isAdmin ? 'sales_test' : 'assigned_rep_id', isAdmin ? false : profile.id).order('id').range(from,to)),
    readPages((from,to) => supabase.from('crm_sales_deal_queue').select('id,business_name,queue_stage,sales_follow_up_at,sales_next_action,assigned_rep_id')
      .not('queue_stage','in','(funded,lost)').is('archived_at',null).eq('sales_test',false)
      .eq(isAdmin ? 'sales_test' : 'assigned_rep_id', isAdmin ? false : profile.id).order('id').range(from,to)),
    readPages<MonthlyMilestone>((from,to) => supabase.from('crm_sales_events')
      .select('id,deal_id,kind,deals!inner(funded_amount,current_stage)')
      .in('kind', ['application_completed', 'funded']).eq('deals.sales_test', false)
      .gte('occurred_at', month.start).lt('occurred_at', month.cutoff)
      .order('id').range(from,to)).catch(() => null),
    isAdmin ? Promise.resolve(null) : readPages<MonthlyLedger>((from,to) => supabase.from('commissions')
      .select('id,commission_amount,deals(sales_test)').eq('rep_id', profile.id)
      .gte('recognized_at', month.start).lt('recognized_at', month.cutoff)
      .order('id').range(from,to)).catch(() => null),
  ]);
  const applications = production ? new Set(production.filter(event => event.kind === 'application_completed').map(event => event.deal_id)).size : 'Unavailable';
  const funded = production && [...new Map(production.filter(event => event.kind === 'funded').map(event => [event.deal_id, event.deals])).values()];
  const volume = funded && funded.every(deal => deal.current_stage === 'Funded' && Number(deal.funded_amount) > 0)
    ? money.format(funded.reduce((sum, deal) => sum + Number(deal.funded_amount), 0)) : 'Unavailable';
  const earned = ledger ? money.format(ledger.filter(row => row.deals?.sales_test !== true).reduce((sum, row) => sum + Number(row.commission_amount), 0)) : 'Unavailable';
  const performance = isAdmin ? '/admin' : '/performance';
  const queues = [
    ['Active interested leads', leads.filter(l => l.sales_stage === 'interested').length, '/hot-leads?stage=interested'],
    ['Waiting for application or statements', leads.filter(l => l.sales_stage !== 'interested').length, '/hot-leads?stage=waiting'],
    ...Object.entries(dealQueueGroups).map(([group, {label, stages}]) =>
      [label, deals.filter(d => stages.includes(d.queue_stage)).length, '/deals?group=' + group]),
  ] as [string,number,string][];
  const followups = [
    ...leads.filter(l => l.next_follow_up_date).map(l => ({ ...l, due: l.next_follow_up_date!, href: '/hot-leads/' + l.id,
      stage: leadStages[l.sales_stage as keyof typeof leadStages], action: 'Contact merchant' })),
    ...deals.filter(d => d.sales_follow_up_at).map(d => ({ ...d, due: d.sales_follow_up_at!, href: '/deals/' + d.id,
      stage: dealStages[d.queue_stage], action: d.sales_next_action ?? 'Follow up', last_contact_date: null, notes: null })),
  ].sort((a,b) => a.due.localeCompare(b.due));
  const today = pacificDate(now);
  const overdue = followups.filter(task => Date.parse(task.due) < Date.parse(now));
  const dueToday = followups.filter(task => pacificDate(task.due) === today && Date.parse(task.due) >= Date.parse(now));
  const upcoming = followups.filter(task => pacificDate(task.due) > today);
  const tasks = { due: [...overdue, ...dueToday], overdue, today: dueToday, upcoming }[filter];
  const limit = filters.all === '1' ? 50 : 5;
  const visible = tasks.slice(0, limit);
  const repIds = [...new Set(visible.flatMap(row => row.assigned_rep_id ? [row.assigned_rep_id] : []))];
  const reps = isAdmin && repIds.length
    ? await supabase.from('profiles').select('id,full_name').in('id',repIds)
    : { data: [] };
  const names = new Map((reps.data ?? []).map(rep => [rep.id, rep.full_name]));
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{isAdmin ? 'Company dashboard' : 'My dashboard'}</h1>
        <Link className="text-sm text-primary hover:underline" href={isAdmin ? '/admin' : '/performance'}>
          {isAdmin ? 'Sales Performance Center' : 'My performance'}
        </Link>
      </div>
      <Link href="/hot-leads/new" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">New lead</Link>
    </header>

    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {[
        ['Active hot leads', leads.length, '/hot-leads'],
        ['Follow-ups today', dueToday.length, '/dashboard?followups=today'],
        ['Overdue follow-ups', overdue.length, '/dashboard?followups=overdue'],
        ['Applications this month', applications, performance + '?metric=activity-application_completed'],
      ].map(([label, count, href]) => <Link key={label} href={String(href)}
        className="rounded-lg border border-border bg-card px-3 py-2 hover:border-primary">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{count}</span>
      </Link>)}
    </div>

    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <h2 className="font-semibold">Follow-ups <span className="text-sm font-normal text-muted-foreground">· {tasks.length}</span></h2>
        <nav aria-label="Follow-up filters" className="flex flex-wrap gap-1">
          {Object.entries(followUpFilters).map(([id,label]) => <Link key={id} href={'/dashboard?followups=' + id}
            aria-current={filter === id ? 'page' : undefined}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{label}</Link>)}
        </nav>
      </div>
      {!visible.length && <p className="border-t border-border p-3 text-sm text-muted-foreground">No follow-ups in this queue.</p>}
      {visible.map(item => <Link key={item.href} href={item.href + '#sales-actions'}
        className="grid gap-x-3 border-t border-border px-3 py-2 text-sm hover:bg-muted/40 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="truncate font-semibold text-primary">{item.business_name}</p>
          <p className="truncate text-xs text-muted-foreground" title={item.notes ?? undefined}>
            {[item.action, item.stage, isAdmin ? names.get(item.assigned_rep_id) : null, item.notes].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-xs sm:text-right">
          <p className={overdue.includes(item) ? 'font-medium text-red-800' : 'font-medium'}>{formatPacificFollowUp(item.due)}</p>
          {item.last_contact_date && <p className="text-muted-foreground">Last contact {item.last_contact_date}</p>}
        </div>
      </Link>)}
      {tasks.length > limit && <Link href={filters.all === '1'
        ? (isAdmin ? '/admin?metric=followups' : '/performance?metric=followups')
        : `/dashboard?followups=${filter}&all=1`}
        className="block border-t border-border px-3 py-2 text-sm text-primary hover:underline">View all follow-ups</Link>}
    </Card>

    <section className="space-y-2">
      <h2 className="font-semibold">Active pipeline</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {queues.map(([label,value,href]) => <Link key={href} href={href}
          className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary">
          <span className="text-xs font-medium">{label}</span><span className="font-semibold tabular-nums">{value}</span>
        </Link>)}
      </div>
    </section>
    {!isAdmin && <section className="space-y-2">
      <h2 className="font-semibold">My performance this month</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Completed applications', applications, 'activity-application_completed'],
          ['Funded deals', funded ? funded.length : 'Unavailable', 'activity-funded'],
          ['Funded volume', volume, 'volume'],
          ['Earned commission', earned, 'earned'],
        ].map(([label,value,metric]) => <Link key={label}
          href={`/performance?period=month&metric=${metric}`}
          className="rounded-lg border border-border bg-card px-3 py-2 hover:border-primary">
          <span className="block text-xs text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span>
        </Link>)}
      </div>
    </section>}
  </div>;
}
