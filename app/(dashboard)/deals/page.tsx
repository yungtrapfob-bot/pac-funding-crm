import { dealStages } from '@/lib/sales-labels';
import { readPages } from '@/lib/supabase/read-pages';
import Link from 'next/link';
import { DealsTable } from '@/components/tables/deals-table';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { getDeals } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_STAGES, toUiPipelineStage } from '@/lib/utils';

const STAGE_FILTERS: Record<string, string[]> = {
  underwriting: ['Application Submitted', 'In Underwriting', 'Application Processed'],
  offers_declines: ['Offers / Declines Received', 'Offers', 'Deal Pitched'],
  contracts_requested: ['Contracts Requested'],
  contracts_out: ['Contracts Requested', 'Contracts Signed', 'Contracts Out'],
  funded: ['Funded'],
  kif: ['Killed', 'KIF'],
  all_apps: []
};

export default async function DealsPage({ searchParams: pendingSearchParams }: { searchParams: Promise<{ q?: string; stage?: string; rep?: string; queue?: string }> }) {
  const searchParams = await pendingSearchParams;
  const { profile } = await requireUser();
  const q = searchParams.q?.toLowerCase().trim() ?? '';
  const stage = searchParams.stage?.trim() ?? '';
  const rep = searchParams.rep?.trim() ?? '';
  const supabase = await createClient();
  const { data: reps } = profile.role === 'admin'
    ? await supabase.from('profiles').select('id,full_name').in('role', ['admin', 'rep']).order('full_name', { ascending: true })
    : { data: [] };
  const queue = searchParams.queue ?? '';
  const filterQueue = Object.hasOwn(dealStages, queue);
  const [initialDeals, queueRows] = await Promise.all([
    getDeals(profile.role, profile.id, rep || undefined),
    readPages((from,to) => {
      const query = supabase.from('crm_sales_deal_queue').select('id,queue_stage').order('id');
      if (filterQueue) query.eq('queue_stage',queue).eq('sales_test',false);
      return query.range(from,to);
    }),
  ]);
  const operationalStages = new Map(queueRows.map(row => [row.id, row.queue_stage]));
  let deals = initialDeals.map(deal => ({...deal, operational_stage: operationalStages.get(deal.id)}));
  if (filterQueue) deals = deals.filter(deal => operationalStages.has(deal.id));
  if (q) deals = deals.filter((d) => [d.business_name, d.owner_name, d.email].some((v) => String(v ?? '').toLowerCase().includes(q)));
  if (stage) {
    if (stage in STAGE_FILTERS && STAGE_FILTERS[stage].length) {
      deals = deals.filter((d) => STAGE_FILTERS[stage].includes(d.current_stage));
    } else if (stage !== 'all_apps') {
      deals = deals.filter((d) => toUiPipelineStage(d.current_stage) === (stage as (typeof PIPELINE_STAGES)[number]));
    }
  }

  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Deals</h1><Link href="/deals/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Submit Deal</Link></div>
  <Card className="rounded-xl border-border/80 bg-card/95 p-4 shadow-sm"><form className="grid grid-cols-1 gap-2 md:grid-cols-5"><Input name="q" defaultValue={q} placeholder="Search business, owner, email"/><select name="queue" aria-label="Operational stage" defaultValue={queue} className="rounded border border-border p-2"><option value="">All operational stages</option>{Object.entries(dealStages).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
    {profile.role === 'admin' ? <select name="rep" defaultValue={rep} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="">All reps</option>{(reps ?? []).map((internalRep) => <option key={internalRep.id} value={internalRep.id}>{internalRep.full_name ?? internalRep.id}</option>)}</select> : null}
    <button className="rounded-md border border-border px-3 py-2 text-sm">Filter</button></form></Card>
  <DealsTable deals={deals} /></div>;
}
