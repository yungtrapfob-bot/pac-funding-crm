import Link from 'next/link';
import { DealsTable } from '@/components/tables/deals-table';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { getDeals } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_STAGES, toDbPipelineStage } from '@/lib/utils';

const STAGE_FILTERS: Record<string, string[]> = {
  underwriting: ['Application Submitted', 'In Underwriting', 'Application Processed'],
  offers_declines: ['Offers / Declines Received', 'Offers'],
  contracts_requested: ['Contracts Requested'],
  contracts_out: ['Contracts Signed', 'Contracts Out'],
  funded: ['Funded'],
  kif: ['Killed', 'KIF'],
  all_apps: []
};

export default async function DealsPage({ searchParams }: { searchParams: { q?: string; stage?: string; rep?: string } }) {
  const { profile } = await requireUser();
  const q = searchParams.q?.toLowerCase().trim() ?? '';
  const stage = searchParams.stage?.trim() ?? '';
  const rep = searchParams.rep?.trim() ?? '';
  const supabase = await createClient();
  const { data: reps } = profile.role === 'admin'
    ? await supabase.from('profiles').select('id,full_name').in('role', ['admin', 'rep']).order('full_name', { ascending: true })
    : { data: [] };
  let deals = await getDeals(profile.role, profile.id, rep || undefined);
  if (q) deals = deals.filter((d) => [d.business_name, d.owner_name, d.email].some((v) => String(v ?? '').toLowerCase().includes(q)));
  if (stage) {
    if (stage in STAGE_FILTERS && STAGE_FILTERS[stage].length) {
      deals = deals.filter((d) => STAGE_FILTERS[stage].includes(d.current_stage));
    } else if (stage !== 'all_apps') {
      deals = deals.filter((d) => d.current_stage === toDbPipelineStage(stage as (typeof PIPELINE_STAGES)[number]));
    }
  }

  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Deals</h1><Link href="/deals/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">Submit Deal</Link></div>
  <Card className="rounded-xl border-border/80 bg-card/95 p-4 shadow-sm"><form className="grid grid-cols-1 gap-2 md:grid-cols-5"><Input name="q" defaultValue={q} placeholder="Search business, owner, email"/><Input name="stage" defaultValue={stage} placeholder="Filter by exact stage"/>
    {profile.role === 'admin' ? <select name="rep" defaultValue={rep} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="">All reps</option>{(reps ?? []).map((internalRep) => <option key={internalRep.id} value={internalRep.id}>{internalRep.full_name ?? internalRep.id}</option>)}</select> : null}
    <button className="rounded-md border border-border px-3 py-2 text-sm">Filter</button></form></Card>
  <DealsTable deals={deals} /></div>;
}
