import { MetricCard } from '@/components/dashboard/metric-card';
import { DealsTable } from '@/components/tables/deals-table';
import { requireUser } from '@/lib/auth';
import { getDashboardMetrics, getDeals } from '@/lib/queries';

export default async function RepDashboardPage() {
  const { profile } = await requireUser();
  const metrics = await getDashboardMetrics(profile.role, profile.id);
  const deals = await getDeals(profile.role, profile.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{profile.role === 'admin' ? 'Company Dashboard' : 'Rep Dashboard'}</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Deals Submitted" value={metrics.submitted} />
        <MetricCard label="Approvals" value={metrics.approvals} />
        <MetricCard label="Open Deals" value={metrics.openDeals} />
        <MetricCard label="Funded Deals" value={metrics.fundedDeals} />
        <MetricCard label="Killed Deals" value={metrics.killedDeals} />
      </div>
      <DealsTable deals={deals} />
    </div>
  );
}
