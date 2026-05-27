import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { getProcessingQueue } from '@/lib/queries';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function currency(value?: number | null) { return `$${Number(value ?? 0).toLocaleString()}`; }

function readinessSignal(item: { hasApplication: boolean; hasStatements: boolean; current_stage: string | null }) {
  const stage = String(item.current_stage ?? '').toLowerCase();
  const alreadyReviewed = ['application processed', 'offers / declines received', 'offers', 'contracts requested', 'contracts signed', 'contracts out', 'funded'].some((s) => stage.includes(s));
  if (alreadyReviewed) return { label: 'Already reviewed/submitted', className: 'bg-blue-600 text-white' };
  if (item.hasApplication && item.hasStatements) return { label: 'Ready for review', className: 'bg-emerald-600 text-white' };
  return { label: 'Needs docs', className: 'bg-amber-500 text-amber-950' };
}

export default async function ProcessingQueuePage() {
  const { profile } = await requireUser();
  if (profile.role !== 'admin') return <p className="text-sm text-muted-foreground">Processing desk access is admin-only.</p>;
  const queue = await getProcessingQueue();

  return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">Processing Queue</h1><p className="text-sm text-muted-foreground">Underwriting submissions listed by newest submitted first.</p></div>
    <Card className="overflow-hidden rounded-xl border-border/80 p-0 shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1400px] text-sm"><thead className="bg-muted/40 text-left"><tr className="border-b border-border"><th className="px-3 py-2 font-medium">Business</th><th className="px-3 py-2 font-medium">Owner / Contact</th><th className="px-3 py-2 font-medium">Assigned Rep</th><th className="px-3 py-2 font-medium">Submitted</th><th className="px-3 py-2 font-medium">Current Stage</th><th className="px-3 py-2 font-medium">Notes Preview</th><th className="px-3 py-2 font-medium">Monthly Revenue</th><th className="px-3 py-2 font-medium">FICO</th><th className="px-3 py-2 font-medium">Positions</th><th className="px-3 py-2 font-medium">NSF</th><th className="px-3 py-2 font-medium">Deposits / Mo</th><th className="px-3 py-2 font-medium">File Status</th><th className="px-3 py-2 font-medium">Review Signal</th><th className="px-3 py-2 font-medium">Actions</th></tr></thead><tbody>
            {queue.map((deal) => {
              const signal = readinessSignal(deal);
              const notesPreview = (deal.internal_notes || deal.notes || '').slice(0, 80);
              const assignedRep = Array.isArray(deal.assigned_rep) ? deal.assigned_rep[0]?.full_name : (deal.assigned_rep as { full_name?: string } | null)?.full_name;
              return <tr key={deal.id} className="border-b border-border/70 align-top"><td className="px-3 py-2 font-medium">{deal.business_name}</td><td className="px-3 py-2">{deal.owner_name || '—'}</td><td className="px-3 py-2">{assignedRep ?? 'Unassigned'}</td><td className="px-3 py-2 text-xs">{formatDate(deal.submitted_at)}</td><td className="px-3 py-2"><Badge>{deal.current_stage || '—'}</Badge></td><td className="px-3 py-2 text-xs text-muted-foreground">{notesPreview ? `${notesPreview}${notesPreview.length >= 80 ? '…' : ''}` : '—'}</td><td className="px-3 py-2">{currency(deal.monthly_revenue)}</td><td className="px-3 py-2">{deal.fico || '—'}</td><td className="px-3 py-2">{deal.positions || 0}</td><td className="px-3 py-2">{deal.nsf_count || 0}</td><td className="px-3 py-2">{deal.deposits || 0}</td><td className="px-3 py-2"><div className="flex flex-col gap-1 text-xs"><span className={deal.hasApplication ? 'text-emerald-700' : 'text-amber-700'}>{deal.hasApplication ? 'App attached' : 'App missing'}</span><span className={deal.hasStatements ? 'text-emerald-700' : 'text-amber-700'}>{deal.hasStatements ? 'Statements attached' : 'Statements missing'}</span></div></td><td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${signal.className}`}>{signal.label}</span></td><td className="px-3 py-2"><Link href={`/deals/${deal.id}?context=processing`} className="text-primary underline">Open file</Link></td></tr>;
            })}
          </tbody></table></div>{!queue.length ? <p className="p-4 text-sm text-muted-foreground">No underwriting submissions in queue yet.</p> : null}</Card></div>;
}
