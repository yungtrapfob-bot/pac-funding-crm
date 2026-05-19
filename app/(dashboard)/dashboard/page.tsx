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
  let leadsQuery = supabase.from('hot_leads').select('id,business_name,owner_name,phone,email,follow_up_status,next_follow_up_at').not('next_follow_up_at', 'is', null).order('next_follow_up_at', { ascending: true }).limit(8);
  if (profile.role === 'rep') leadsQuery = leadsQuery.eq('assigned_rep_id', profile.id);
  const { data: leads } = await leadsQuery;

  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">{profile.role === 'admin' ? 'Company Dashboard' : 'Rep Dashboard'}</h1><p className="text-sm text-muted-foreground">Operating snapshot for today.</p></div>
  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6"><MetricCard label="Underwriting" value={metrics.underwriting} /><MetricCard label="Offers" value={metrics.offers} /><MetricCard label="Contracts Out" value={metrics.contractsOut} /><MetricCard label="Funded" value={metrics.fundedDeals} /><MetricCard label="KIF" value={metrics.kifDeals} /><MetricCard label="Funded Volume" value={`$${metrics.fundedAmount.toLocaleString()}`} /></div>
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><Card><h2 className="mb-3 text-lg font-medium">Follow-up Tasks</h2>{!leads?.length ? <p className="text-sm text-muted-foreground">No upcoming follow-up tasks.</p> : <div className="space-y-2">{leads.map((lead) => <Link key={lead.id} href={`/hot-leads/${lead.id}`} className="block rounded-md border border-border p-2 text-sm hover:bg-muted/40"><p className="font-medium text-primary">{lead.business_name}</p><p className="text-muted-foreground">{lead.owner_name} · {lead.phone || lead.email || 'No contact info'}</p><p>{lead.follow_up_status} · {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : 'No due date'}</p></Link>)}</div>}</Card>
  <section className="space-y-2"><h2 className="text-lg font-medium">Recent deals</h2>{!deals.length ? <Card><p className="text-sm text-muted-foreground">No deals submitted yet.</p></Card> : <DealsTable deals={deals.slice(0, 8)} />}</section></div></div>;
}
