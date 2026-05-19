import Link from 'next/link';
import { DealsTable } from '@/components/tables/deals-table';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { getDeals } from '@/lib/queries';

export default async function DealsPage({ searchParams }: { searchParams: { q?: string; stage?: string } }) {
  const { profile } = await requireUser();
  const q = searchParams.q?.toLowerCase().trim() ?? '';
  const stage = searchParams.stage?.trim() ?? '';
  let deals = await getDeals(profile.role, profile.id);
  if (q) deals = deals.filter((d) => [d.business_name, d.owner_name, d.email].some((v) => String(v ?? '').toLowerCase().includes(q)));
  if (stage) deals = deals.filter((d) => d.current_stage === stage);

  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Deals</h1><Link href="/deals/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">Submit Deal</Link></div>
  <Card><form className="grid grid-cols-1 gap-2 md:grid-cols-4"><Input name="q" defaultValue={q} placeholder="Search business, owner, email"/><Input name="stage" defaultValue={stage} placeholder="Filter by exact stage"/><button className="rounded-md border border-border px-3 py-2 text-sm">Filter</button></form></Card>
  <DealsTable deals={deals} /></div>;
}
