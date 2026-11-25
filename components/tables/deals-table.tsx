import { dealStages } from '@/lib/sales-labels';
import { formatPacificDate } from '@/lib/pacific-time';
import Link from 'next/link';
import { LeadCheckbox, LeadSelection } from '@/components/hot-leads/lead-selection';
import { Badge } from '@/components/ui/badge';

interface DealRow { id: string; business_name: string; owner_name: string; current_stage: string; operational_stage?: string; submitted_at: string; assigned_rep?: { full_name?: string | null } | null; }

export function DealsTable({ deals, canManage = false }: { deals: DealRow[]; canManage?: boolean }) {
  const table = deals.length ? <div className="overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full min-w-[640px] text-sm"><thead className="sticky top-0 bg-muted text-left"><tr>{canManage && <th scope="col" className="w-10"><span className="sr-only">Select</span></th>}{['Business','Owner','Assigned Rep','Stage','Submitted'].map((h)=><th key={h} className="tracked-label p-3 text-muted-foreground">{h}</th>)}</tr></thead><tbody>{deals.map((deal)=><tr key={deal.id} className="h-10 border-t border-border hover:bg-muted/40">{canManage && <td className="px-3"><LeadCheckbox lead={{ id: deal.id, name: deal.business_name }} /></td>}<td className="p-3"><Link href={`/deals/${deal.id}`} className="font-medium text-foreground hover:text-primary">{deal.business_name}</Link></td><td className="p-3">{deal.owner_name}</td><td className="p-3">{deal.assigned_rep?.full_name ?? 'Unassigned'}</td><td className="p-3"><div className="flex items-center gap-2"><span className="h-4 w-0.5 bg-info" /><Badge>{dealStages[deal.operational_stage ?? ''] ?? deal.current_stage}</Badge></div></td><td className="p-3 tabular text-muted-foreground">{formatPacificDate(deal.submitted_at)}</td></tr>)}</tbody></table></div>
    : <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No deals match this view.</p>;
  return canManage ? <LeadSelection entity="deal" leads={deals.map(deal => ({ id: deal.id, name: deal.business_name }))}>{table}</LeadSelection> : table;
}
