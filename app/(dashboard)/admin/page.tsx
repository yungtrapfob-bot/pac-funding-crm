import { MetricCard } from '@/components/dashboard/metric-card';
import { Card } from '@/components/ui/card';
import { reconcileInternalAuthUsers } from '@/actions/admin-users';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toUiPipelineStage } from '@/lib/utils';

export default async function AdminDashboardPage() {
  await requireRole(['admin']);
  await reconcileInternalAuthUsers();
  const supabase = await createClient();
  const { data: deals } = await supabase.from('deals').select('id,assigned_rep_id,owner_profile_id,current_stage,funded_amount,submitted_at');
  const { data: hotLeads } = await supabase.from('hot_leads').select('id,assigned_rep_id,owner_profile_id,created_at');
  const { data: offers } = await supabase.from('offers').select('deal_id, approval_amount, status');
  const { data: profiles } = await supabase.from('profiles').select('id,full_name,role');

  const apps = deals?.length ?? 0;
  const underwritingDeals = deals?.filter((d) => ['Application Submitted', 'In Underwriting'].includes(d.current_stage)).length ?? 0;
  const offersDeals = deals?.filter((d) => d.current_stage === 'Offers / Declines Received').length ?? 0;
  const contractsRequestedDeals = deals?.filter((d) => d.current_stage === 'Contracts Requested').length ?? 0;
  const contractsOutDeals = deals?.filter((d) => d.current_stage === 'Contracts Signed' || d.current_stage === 'Contracts Out').length ?? 0;
  const fundedDeals = deals?.filter((d) => toUiPipelineStage(d.current_stage) === 'Funded').length ?? 0;
  const killedDeals = deals?.filter((d) => toUiPipelineStage(d.current_stage) === 'KIF').length ?? 0;
  const totalOpenApprovalAmount = (offers ?? []).filter((o) => o.status === 'open').reduce((sum, o) => sum + Number(o.approval_amount), 0);
  const dealRepLookup = new Map((deals ?? []).map((d) => [d.id, d.owner_profile_id ?? d.assigned_rep_id]));

  const internalRoleWhitelist = new Set(['admin', 'rep']);
  const internalProfiles = (profiles ?? []).filter((profile) => internalRoleWhitelist.has(String(profile.role ?? '').toLowerCase()));
  type RepMetrics = {
    hotLeads: number;
    appsSubmitted: number;
    underwriting: number;
    offers: number;
    contractsOut: number;
    fundedDeals: number;
    totalFundedAmount: number;
    openApprovalAmount: number;
    lastActivity: string | null;
  };

  const emptyMetrics = (): RepMetrics => ({
    hotLeads: 0,
    appsSubmitted: 0,
    underwriting: 0,
    offers: 0,
    contractsOut: 0,
    fundedDeals: 0,
    totalFundedAmount: 0,
    openApprovalAmount: 0,
    lastActivity: null
  });

  const metricsByRep = new Map<string, RepMetrics>();
  const ensureRepMetrics = (repId: string) => {
    const existing = metricsByRep.get(repId);
    if (existing) return existing;
    const created = emptyMetrics();
    metricsByRep.set(repId, created);
    return created;
  };

  (hotLeads ?? []).forEach((lead) => {
    const leadOwnerId = lead.owner_profile_id ?? lead.assigned_rep_id;
    if (!leadOwnerId) return;
    const metrics = ensureRepMetrics(leadOwnerId);
    metrics.hotLeads += 1;
    if (!metrics.lastActivity || new Date(lead.created_at) > new Date(metrics.lastActivity)) metrics.lastActivity = lead.created_at;
  });

  (deals ?? []).forEach((deal) => {
    const dealOwnerId = deal.owner_profile_id ?? deal.assigned_rep_id;
    if (!dealOwnerId) return;
    const metrics = ensureRepMetrics(dealOwnerId);
    metrics.appsSubmitted += 1;
    if (['Application Submitted', 'In Underwriting'].includes(deal.current_stage)) metrics.underwriting += 1;
    if (deal.current_stage === 'Offers / Declines Received') metrics.offers += 1;
    if (deal.current_stage === 'Contracts Signed' || deal.current_stage === 'Contracts Out') metrics.contractsOut += 1;
    if (toUiPipelineStage(deal.current_stage) === 'Funded') metrics.fundedDeals += 1;
    metrics.totalFundedAmount += Number(deal.funded_amount ?? 0);
    if (!metrics.lastActivity || new Date(deal.submitted_at) > new Date(metrics.lastActivity)) metrics.lastActivity = deal.submitted_at;
  });

  (offers ?? []).forEach((offer) => {
    if (offer.status !== 'open') return;
    const repId = dealRepLookup.get(offer.deal_id);
    if (!repId) return;
    const metrics = ensureRepMetrics(repId);
    metrics.openApprovalAmount += Number(offer.approval_amount ?? 0);
  });

  const repRows = internalProfiles
    .map((rep) => ({
      repId: rep.id,
      repName: rep.full_name ?? 'Unknown Rep',
      ...emptyMetrics(),
      ...(metricsByRep.get(rep.id) ?? {})
    }))
    .sort((a, b) => b.totalFundedAmount - a.totalFundedAmount || b.fundedDeals - a.fundedDeals || b.appsSubmitted - a.appsSubmitted || a.repName.localeCompare(b.repName));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard label="Apps Submitted" value={apps} href="/deals?stage=all_apps" />
        <MetricCard label="In Underwriting" value={underwritingDeals} href="/deals?stage=underwriting" />
        <MetricCard label="Offers / Declines Received" value={offersDeals} href="/deals?stage=offers_declines" />
        <MetricCard label="Contracts Requested" value={contractsRequestedDeals} href="/deals?stage=contracts_requested" />
        <MetricCard label="Contracts Out" value={contractsOutDeals} href="/deals?stage=contracts_out" />
        <MetricCard label="Funded" value={fundedDeals} href="/deals?stage=funded" />
        <MetricCard label="KIF" value={killedDeals} href="/deals?stage=kif" />
        <MetricCard label="Open Approval $" value={`$${totalOpenApprovalAmount.toLocaleString()}`} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Rep Performance</h2>
          <p className="text-sm text-muted-foreground">Production and pipeline contribution by internal owner attribution.</p>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Rep</th><th className="p-3">Hot Leads</th><th className="p-3">Apps Submitted</th><th className="p-3">Underwriting</th><th className="p-3">Offers</th><th className="p-3">Contracts Out</th><th className="p-3">Funded Deals</th><th className="p-3">Total Funded $</th><th className="p-3">Open Approval $</th><th className="p-3">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {!repRows.length ? <tr><td className="p-3 text-muted-foreground" colSpan={10}>No rep activity yet.</td></tr> : repRows.map((row) => (
                <tr key={row.repId} className="border-t border-border">
                  <td className="p-3 font-medium">{row.repName}</td><td className="p-3">{row.hotLeads}</td><td className="p-3">{row.appsSubmitted}</td><td className="p-3">{row.underwriting}</td><td className="p-3">{row.offers}</td><td className="p-3">{row.contractsOut}</td><td className="p-3">{row.fundedDeals}</td><td className="p-3">${row.totalFundedAmount.toLocaleString()}</td><td className="p-3">${row.openApprovalAmount.toLocaleString()}</td><td className="p-3">{row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
