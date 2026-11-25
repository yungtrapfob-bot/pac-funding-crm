import Link from 'next/link';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { formatPacificDateTime, pacificDate } from '@/lib/pacific-time';
import { dealStages, leadStages } from '@/lib/sales-labels';
import { createClient } from '@/lib/supabase/server';
import { readPages } from '@/lib/supabase/read-pages';

export default async function Dashboard() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';
  const now = new Date().toISOString();
  const [leads, deals] = await Promise.all([
    readPages((from,to) => supabase.from('hot_leads')
      .select('id,business_name,sales_stage,next_follow_up_date,last_contact_date,notes,assigned_rep_id')
      .is('archived_at',null).is('converted_at',null).eq('sales_lost',false).eq('sales_review',false).eq('sales_test',false)
      .order('id').range(from,to)),
    readPages((from,to) => supabase.from('crm_sales_deal_queue').select('id,business_name,queue_stage,sales_follow_up_at,sales_next_action,assigned_rep_id')
      .not('queue_stage','in','(funded,lost)').eq('sales_test',false).order('id').range(from,to)),
  ]);
  const queues = [
    ['Active interested leads', leads.filter(l => l.sales_stage === 'interested').length, '/hot-leads?stage=interested'],
    ['Waiting for application or statements', leads.filter(l => l.sales_stage !== 'interested').length, '/hot-leads?stage=waiting'],
    ...Object.entries(dealStages).filter(([stage]) => !['funded','lost'].includes(stage)).map(([stage,label]) =>
      [label, deals.filter(d => d.queue_stage === stage).length, '/deals?queue=' + stage]),
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
  const attention = deals.filter(d => ['missing_documents','approved','pitched','contracts_out','stipulations','final_conditions'].includes(d.queue_stage));
  const repIds = [...new Set([...followups,...attention].flatMap(row => row.assigned_rep_id ? [row.assigned_rep_id] : []))];
  const reps = repIds.length ? await supabase.from('profiles').select('id,full_name').in('id',repIds) : {data:[]};
  const names = new Map((reps.data ?? []).map(rep => [rep.id, rep.full_name]));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{isAdmin ? 'Company work queue' : 'Daily action center'}</h1>
      <Link className="text-primary underline" href={isAdmin ? '/admin' : '/performance'}>{isAdmin ? 'Sales Performance Center' : 'My performance'}</Link>
    </header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[['Overdue',overdue],['Due today',dueToday],['Upcoming',upcoming]].map(([title,tasks]) => {
        const items = tasks as typeof followups;
        return <Card key={String(title)} className="space-y-2">
          <h2 className="font-semibold">{String(title)} <span className="text-muted-foreground">· {items.length}</span></h2>
          {!items.length && <p className="text-sm text-muted-foreground">No follow-ups.</p>}
          {items.slice(0,8).map(item => <Link key={item.href} href={item.href + '#sales-actions'} className="block rounded border border-border p-2 text-sm hover:bg-muted/40">
            <span className="font-medium text-primary">{item.business_name}</span>
            <p>{item.action} · {item.stage}</p>
            <p className="text-muted-foreground">{formatPacificDateTime(item.due)} · {names.get(item.assigned_rep_id) ?? 'Unassigned'}</p>
            {item.last_contact_date && <p className="text-muted-foreground">Last contact {item.last_contact_date}</p>}
            {item.notes && <p className="truncate text-muted-foreground">{item.notes}</p>}
          </Link>)}
          {items.length > 8 && <Link href={isAdmin ? '/admin?metric=followups' : '/performance?metric=followups'} className="text-sm text-primary underline">View all follow-ups</Link>}
        </Card>;
      })}
    </div>
    <Card>
      <h2 className="mb-2 font-semibold">Deals needing attention <span className="text-muted-foreground">· {attention.length}</span></h2>
      {!attention.length && <p className="text-sm text-muted-foreground">No deals need attention in these queues.</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {attention.slice(0,12).map(deal => <Link key={deal.id} href={`/deals/${deal.id}#sales-actions`} className="rounded border border-border p-2 text-sm hover:bg-muted/40">
          <span className="font-medium text-primary">{deal.business_name}</span><p>{dealStages[deal.queue_stage]} · {names.get(deal.assigned_rep_id) ?? 'Unassigned'}</p>
        </Link>)}
      </div>
    </Card>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Current inventory</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {queues.map(([label,value,href]) => <MetricCard key={href} label={label} value={value} href={href} />)}
      </div>
    </section>
  </div>;
}
