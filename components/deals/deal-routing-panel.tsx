'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submissionMethodLabel, type RoutingResult } from '@/lib/funder-routing';

function reasonTone(status: string) {
  if (status === 'pass') return 'text-emerald-300';
  if (status === 'fail') return 'text-red-300';
  if (status === 'warn') return 'text-amber-300';
  return 'text-muted-foreground';
}

type SectionProps = {
  title: string;
  items: RoutingResult[];
  dealId: string;
  targetFunders: string[];
  queuedFunders: string[];
  toggleTarget: (funderName: string) => void;
  toggleQueued: (funderName: string) => void;
};

function Section({ title, items, dealId, targetFunders, queuedFunders, toggleTarget, toggleQueued }: SectionProps) {
  return <div className="space-y-2">
    <h3 className="text-base font-semibold">{title} ({items.length})</h3>
    <div className="space-y-2">
      {items.map((item) => <div key={item.funderName} className="rounded-md border border-border/80 bg-card/80 p-3 text-sm shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{item.funderName}</p>
          <Badge>{item.result}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{item.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">Submission: <span className="font-medium text-foreground">{submissionMethodLabel(item.submissionMethod)}</span> · Positions: {item.positions || '—'} · Min Rev: {item.minRevenue ? `$${Number(item.minRevenue).toLocaleString()}` : '—'} · Min FICO: {item.minFico ?? '—'} · Max Funding: {item.maxFunding ? `$${Number(item.maxFunding).toLocaleString()}` : '—'}</p>
        <ul className="mt-2 list-disc pl-5 text-xs">
          {item.reasons.slice(0, 5).map((reason, idx) => <li key={idx} className={reasonTone(reason.status)}><span className="font-medium">{reason.status.toUpperCase()}:</span> {reason.message}</li>)}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Button type="button" className={targetFunders.includes(item.funderName) ? 'justify-start border-emerald-400 bg-emerald-500/20 text-emerald-100' : 'justify-start'} onClick={() => toggleTarget(item.funderName)}>{targetFunders.includes(item.funderName) ? 'Target marked' : 'Mark target'}</Button>
          <Button type="button" className={queuedFunders.includes(item.funderName) ? 'justify-start border-sky-400 bg-sky-500/20 text-sky-100' : 'justify-start'} onClick={() => toggleQueued(item.funderName)}>{queuedFunders.includes(item.funderName) ? 'Queued' : 'Queue for submission'}</Button>
          <Link href={`/admin/funders?dealId=${encodeURIComponent(dealId)}&search=${encodeURIComponent(item.funderName)}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition duration-120 ease-out hover:border-primary/50 hover:bg-card">Open full guidelines</Link>
        </div>
      </div>)}
    </div>
  </div>;
}

export function DealRoutingPanel({ results, dealId }: { results: RoutingResult[]; dealId: string }) {
  const [targetFunders, setTargetFunders] = useState<string[]>([]);
  const [queuedFunders, setQueuedFunders] = useState<string[]>([]);
  const recommended = results.filter((r) => r.result === 'recommended');
  const possible = results.filter((r) => r.result === 'possible');
  const declined = results.filter((r) => r.result === 'declined');
  const toggleTarget = (funderName: string) => setTargetFunders((current) => current.includes(funderName) ? current.filter((name) => name !== funderName) : [...current, funderName]);
  const toggleQueued = (funderName: string) => setQueuedFunders((current) => current.includes(funderName) ? current.filter((name) => name !== funderName) : [...current, funderName]);

  return <Card>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-medium">Deal Router / Match Engine</h2>
        <p className="text-sm text-muted-foreground">Auto-filled from this deal. Funders are grouped into send-first, manual-review, and not-a-fit lanes with underwriting notes per funder.</p>
      </div>
      <Link href={`/admin/funders?dealId=${encodeURIComponent(dealId)}`} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition duration-120 ease-out hover:border-primary/50 hover:bg-card">Open full router</Link>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Recommended" items={recommended} dealId={dealId} targetFunders={targetFunders} queuedFunders={queuedFunders} toggleTarget={toggleTarget} toggleQueued={toggleQueued} />
      <Section title="Possible / Manual Review" items={possible} dealId={dealId} targetFunders={targetFunders} queuedFunders={queuedFunders} toggleTarget={toggleTarget} toggleQueued={toggleQueued} />
      <Section title="Declined / Not a Fit" items={declined} dealId={dealId} targetFunders={targetFunders} queuedFunders={queuedFunders} toggleTarget={toggleTarget} toggleQueued={toggleQueued} />
    </div>
  </Card>;
}
