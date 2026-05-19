import { MetricCard } from '@/components/dashboard/metric-card';
import { DealsTable } from '@/components/tables/deals-table';
import { requireUser } from '@/lib/auth';
import { getDashboardMetrics, getDeals } from '@/lib/queries';

export default async function RepDashboardPage() {
  const { profile } = await requireUser();

  let metrics = {
    submitted: 0,
    approvals: 0,
    openDeals: 0,
    fundedDeals: 0,
    killedDeals: 0,
    fundedAmount: 0
  };
  let deals: Awaited<ReturnType<typeof getDeals>> = [];
  let dashboardLoadError: string | null = null;

  try {
    [metrics, deals] = await Promise.all([getDashboardMetrics(profile.role, profile.id), getDeals(profile.role, profile.id)]);
  } catch (error) {
    console.error('[dashboard] failed to load metrics or deals', {
      userId: profile.id,
      role: profile.role,
      message: error instanceof Error ? error.message : 'unknown error'
    });
    dashboardLoadError = 'Some dashboard data could not be loaded. Showing limited results.';
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{profile.role === 'admin' ? 'Company Dashboard' : 'Rep Dashboard'}</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Use this dashboard to track deal volume and current pipeline health.</p>
      </div>

      {dashboardLoadError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{dashboardLoadError}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Deals Submitted" value={metrics.submitted} />
        <MetricCard label="Approvals" value={metrics.approvals} />
        <MetricCard label="Open Deals" value={metrics.openDeals} />
        <MetricCard label="Funded Deals" value={metrics.fundedDeals} />
        <MetricCard label="Killed Deals" value={metrics.killedDeals} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent deals</h2>
        <DealsTable deals={deals} />
      </section>
    </div>
  );
}
