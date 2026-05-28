import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RoutingResult } from '@/lib/funder-routing';

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
          {item.reasons.map((reason, idx) => <li key={idx}><span className="font-medium">{reason.status.toUpperCase()}:</span> {reason.message}</li>)}
        </ul>
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
    <div className="mt-4 grid gap-3 border-t pt-4 text-sm md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-md border border-dashed p-3">
        <p className="font-medium">Target Funder</p>
        <p className="mt-1 text-muted-foreground">Reserved for marking a result as top submission target.</p>
      </div>
      <div className="rounded-md border border-dashed p-3">
        <p className="font-medium">Queue for Submission</p>
        <p className="mt-1 text-muted-foreground">Reserved for adding selected funders to an internal send queue.</p>
      </div>
      <div className="rounded-md border border-dashed p-3">
        <p className="font-medium">Submission Method</p>
        <p className="mt-1 text-muted-foreground">Reserved for selecting API / email / portal mode.</p>
      </div>
      <div className="rounded-md border border-dashed p-3">
        <p className="font-medium">Open Guidelines</p>
        <p className="mt-1 text-muted-foreground">Reserved for launching full funder guideline reference from a result.</p>
      </div>
    </div>
  </Card>;
}
