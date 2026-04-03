import { MetricCard } from '@/components/dashboard/metric-card';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function AdminDashboardPage() {
  await requireRole(['admin']);
  const supabase = createClient();
  const { data: deals } = await supabase.from('deals').select('*');
  const { data: offers } = await supabase.from('offers').select('approval_amount, status');

  const apps = deals?.length ?? 0;
  const fundedDeals = deals?.filter((d) => d.current_stage === 'Funded').length ?? 0;
  const killedDeals = deals?.filter((d) => d.current_stage === 'Killed').length ?? 0;
  const contractsSigned = deals?.filter((d) => d.current_stage === 'Contracts Signed').length ?? 0;
  const totalOpenApprovalAmount = (offers ?? []).filter((o) => o.status === 'open').reduce((sum, o) => sum + Number(o.approval_amount), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Apps Submitted" value={apps} />
        <MetricCard label="Funded Deals" value={fundedDeals} />
        <MetricCard label="Killed Deals" value={killedDeals} />
        <MetricCard label="Contracts Signed" value={contractsSigned} />
        <MetricCard label="Open Approval $" value={`$${totalOpenApprovalAmount.toLocaleString()}`} />
      </div>
    </div>
  );
}
