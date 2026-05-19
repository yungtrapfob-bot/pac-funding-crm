import Link from 'next/link';
import { MetricCard } from '@/components/dashboard/metric-card';
import { DealsTable } from '@/components/tables/deals-table';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getDashboardMetrics, getDeals } from '@/lib/queries';

export default async function RepDashboardPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const [metrics, deals] = await Promise.all([getDashboardMetrics(profile.role, profile.id), getDeals(profile.role, profile.id)]);
  let leadsQuery = supabase.from('hot_leads').select('id,business_name,follow_up_status,next_follow_up_date').order('created_at', { ascending: false }).limit(6);
  if (profile.role === 'rep') leadsQuery = leadsQuery.eq('assigned_rep_id', profile.id);
  const { data: leads } = await leadsQuery;

  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">{profile.role === 'admin' ? 'Company Dashboard' : 'Rep Dashboard'}</h1><p className="text-sm text-muted-foreground">Operating snapshot for today.</p></div>
  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6"><MetricCard label="Submitted" value={metrics.submitted} /><MetricCard label="Approvals" value={metrics.approvals} /><MetricCard label="Open" value={metrics.openDeals} /><MetricCard label="Funded" value={metrics.fundedDeals} /><MetricCard label="Killed" value={metrics.killedDeals} /><MetricCard label="Funded Volume" value={`$${metrics.fundedAmount.toLocaleString()}`} /></div>
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><Card><h2 className="mb-3 text-lg font-medium">Recent hot leads</h2>{!leads?.length ? <p className="text-sm text-muted-foreground">No hot leads yet.</p> : <div className="space-y-2">{leads.map((lead) => <div key={lead.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm"><Link href={`/hot-leads/${lead.id}`} className="font-medium text-primary hover:underline">{lead.business_name}</Link><span>{lead.follow_up_status} · {lead.next_follow_up_date ?? 'No follow-up'}</span></div>)}</div>}</Card>
  <section className="space-y-2"><h2 className="text-lg font-medium">Recent deals</h2>{!deals.length ? <Card><p className="text-sm text-muted-foreground">No deals submitted yet.</p></Card> : <DealsTable deals={deals.slice(0, 8)} />}</section></div></div>;
}
