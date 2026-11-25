import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { dealStages } from '@/lib/sales-labels';
import { createClient } from '@/lib/supabase/server';
import { readPages } from '@/lib/supabase/read-pages';

export default async function AdminPipelinePage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const deals = await readPages((from, to) => supabase.from('crm_sales_deal_queue')
    .select('id,business_name,queue_stage,has_documents,sales_stage')
    .is('archived_at', null).eq('sales_test', false)
    .order('submitted_at', { ascending: false }).order('id').range(from, to));
  const groups = Object.entries(dealStages).map(([stage, label]) => ({
    stage, label, deals: deals.filter(deal => deal.queue_stage === stage),
  })).filter(group => group.deals.length);

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">Admin Pipeline</h1>
      <Link href="/deals" className="text-sm text-primary hover:underline">Manage deals</Link>
    </header>
    {!groups.length && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No deals in the pipeline.</p>}
    {groups.map(group => <section key={group.stage} className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="bg-muted/40 px-3 py-2 text-sm font-semibold">
        <Link href={`/deals?queue=${group.stage}`} className="hover:underline">{group.label}</Link>
        <span className="ml-2 font-normal text-muted-foreground">{group.deals.length}</span>
      </h2>
      <ul className="divide-y divide-border">
        {group.deals.map(deal => <li key={deal.id}>
          <Link href={`/deals/${deal.id}`} className="flex flex-wrap items-center justify-between gap-x-4 px-3 py-2 text-sm hover:bg-muted/40">
            <span className="font-medium text-primary">{deal.business_name}</span>
            <span className="text-xs text-muted-foreground">
              {deal.has_documents ? 'Application and statements on file' : 'Documents incomplete'}
              {!deal.sales_stage && ' · Stage inferred from existing records'}
            </span>
          </Link>
        </li>)}
      </ul>
    </section>)}
  </div>;
}
