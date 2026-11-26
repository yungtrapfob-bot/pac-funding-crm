import Link from 'next/link';
import { getProcessingQueue } from '@/lib/queries';
import { formatPacificDateTime } from '@/lib/pacific-time';
import { dealStages } from '@/lib/sales-labels';
import { Card } from '@/components/ui/card';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const intake = ['missing_documents','processing','submitted','underwriting','stipulations'];

export default async function ProcessingQueue({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const selected = stage && intake.includes(stage) ? stage : undefined;
  const queue = await getProcessingQueue(selected);
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold">Processing queue</h1>
      <Link href="/admin/processing/responses" className="text-sm text-primary hover:underline">Funder responses</Link>
    </header>
    <nav className="flex flex-wrap gap-2 text-sm">
      {[undefined,...intake].map(key => <Link href={key ? '/admin/processing?stage='+key : '/admin/processing'}
        key={key ?? 'all'} aria-current={selected === key ? 'page' : undefined}
        className="rounded border border-border px-2 py-1 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{key ? dealStages[key] : 'All intake'}</Link>)}
    </nav>
    <Card>
      <h2 className="mb-2 text-sm font-semibold">{queue.length} {queue.length === 1 ? 'deal' : 'deals'}</h2>
      {!queue.length ? <p className="text-sm text-muted-foreground">No deals in this queue.</p> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr>{['Merchant','Stage','Assigned rep','Processor','Intake','Request','Documents','Funder fit','Next action'].map(text => <th className="pr-3" key={text}>{text}</th>)}</tr></thead>
          <tbody>{queue.map(row => <tr className="border-t border-border" key={row.id}>
            <td className="py-2 pr-3"><Link className="text-primary underline" href={`/deals/${row.id}?context=processing`}>{row.business_name}</Link></td>
            <td className="pr-3">{dealStages[row.queue_stage]}</td>
            <td className="pr-3">{row.assigned_name ?? 'Unassigned'}</td>
            <td className="pr-3">{row.processor_name ?? 'Unassigned'}</td>
            <td className="pr-3">{formatPacificDateTime(row.submitted_at)}</td>
            <td className="pr-3">{row.requested_amount ? dollars.format(row.requested_amount) : '—'}</td>
            <td className="pr-3">{!row.has_documents ? 'Incomplete' : row.application_review_required && !row.application_reviewed_at
              ? 'Ready for document review' : 'Application and statements on file'}</td>
            <td className="pr-3"><Link href={`/deals/${row.id}?context=processing#funder-submissions`} className="flex flex-wrap gap-1 hover:underline">
              <span className="rounded bg-emerald-50 px-1 text-emerald-900">GO {row.counts.YES}</span>
              <span className="rounded bg-amber-50 px-1 text-amber-900">MAYBE {row.counts.MAYBE}</span>
              <span className="rounded bg-red-50 px-1 text-red-900">NO {row.counts.NO}</span>
            </Link></td>
            <td>{row.sales_next_action ?? '—'}{row.sales_follow_up_at && <span className="block text-xs text-muted-foreground">{formatPacificDateTime(row.sales_follow_up_at)}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>
  </div>;
}
