import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { RoutingResult } from '@/lib/funder-routing';

function reasonTone(status: string) {
  if (status === 'pass') return 'text-emerald-700';
  if (status === 'fail') return 'text-red-700';
  if (status === 'warn') return 'text-amber-700';
  return 'text-muted-foreground';
}

function Section({ title, items }: { title: string; items: RoutingResult[] }) {
  return <div className="space-y-2">
    <h3 className="text-base font-semibold">{title} ({items.length})</h3>
    <div className="space-y-2">
      {items.map((item) => <div key={item.funderName} className="rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{item.funderName}</p>
          <Badge>{item.result}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{item.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">Submission: {item.submissionMethod} · Positions: {item.positions || '—'} · Min Rev: {item.minRevenue ? `$${Number(item.minRevenue).toLocaleString()}` : '—'} · Min FICO: {item.minFico ?? '—'} · Max Funding: {item.maxFunding ? `$${Number(item.maxFunding).toLocaleString()}` : '—'}</p>
        <ul className="mt-2 list-disc pl-5 text-xs">
          {item.reasons.map((reason, idx) => <li key={idx} className={reasonTone(reason.status)}><span className="font-medium">{reason.status.toUpperCase()}:</span> {reason.message}</li>)}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button type="button" className="justify-start" disabled>Mark as target funder</Button>
          <Button type="button" className="justify-start" disabled>Queue for submission</Button>
          <Button type="button" className="justify-start" disabled>Choose submission method</Button>
          <Link href={`/admin/funders?search=${encodeURIComponent(item.funderName)}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition duration-120 ease-out hover:border-primary/50 hover:bg-card">Open full guidelines</Link>
        </div>
      </div>)}
    </div>
  </div>;
}

export function DealRoutingPanel({ results }: { results: RoutingResult[] }) {
  const recommended = results.filter((r) => r.result === 'recommended');
  const possible = results.filter((r) => r.result === 'possible');
  const declined = results.filter((r) => r.result === 'declined');

  return <Card>
    <h2 className="mb-2 text-lg font-medium">Deal Router / Match Engine</h2>
    <p className="mb-3 text-sm text-muted-foreground">For this deal, funders are grouped into who to send first, who needs manual review, and who is not a fit, with explicit reason checks per funder.</p>
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Recommended" items={recommended} />
      <Section title="Possible / Manual Review" items={possible} />
      <Section title="Declined / Not a Fit" items={declined} />
    </div>
  </Card>;
}
