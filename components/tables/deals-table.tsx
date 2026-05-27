import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface DealRow { id: string; business_name: string; owner_name: string; current_stage: string; submitted_at: string; assigned_rep?: { full_name?: string | null } | null; }

export function DealsTable({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No pipeline records yet. Submit a deal to open this queue.</p>;
  return <div className="overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full min-w-[640px] text-sm"><thead className="sticky top-0 bg-muted text-left"><tr>{['Business','Owner','Assigned Rep','Stage','Submitted'].map((h)=><th key={h} className="tracked-label p-3 text-muted-foreground">{h}</th>)}</tr></thead><tbody>{deals.map((deal)=><tr key={deal.id} className="h-10 border-t border-border hover:bg-muted/40"><td className="p-3"><Link href={`/deals/${deal.id}`} className="font-medium text-foreground hover:text-primary">{deal.business_name}</Link></td><td className="p-3">{deal.owner_name}</td><td className="p-3">{deal.assigned_rep?.full_name ?? 'Unassigned'}</td><td className="p-3"><div className="flex items-center gap-2"><span className="h-4 w-0.5 bg-info" /><Badge>{deal.current_stage}</Badge></div></td><td className="p-3 tabular text-muted-foreground">{new Date(deal.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>;
}
