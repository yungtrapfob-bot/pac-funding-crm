'use client';

import { useMemo, useState, useTransition } from 'react';
import { sendFunderSubmissions } from '@/actions/funder-submissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Preview = { funderId: string; funderName: string; method: string; to: string; cc?: string; bcc?: string; subject: string; body: string; attachments: { filename: string; fileType: string | null }[]; missingDocuments: string[]; previousStatus?: string | null; lastSubmittedAt?: string | null; idempotencyKey: string };
type Routing = { funderName: string; fit: string; summary: string; score: number };

export function FunderSubmissionsWorkspace({ dealId, previews, routingResults }: { dealId: string; previews: Preview[]; routingResults: Routing[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState('normal');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const routingByName = useMemo(() => new Map(routingResults.map((r) => [r.funderName, r])), [routingResults]);
  const selectedPreviews = previews.filter((p) => selected.includes(p.funderId));
  const canSend = selectedPreviews.length > 0 && selectedPreviews.every((p) => p.method === 'email' && p.to && !p.previousStatus && p.missingDocuments.length === 0);

  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]); }
  function send() {
    const fd = new FormData(); fd.set('deal_id', dealId); fd.set('priority', priority); selected.forEach((id) => fd.append('funder_id', id));
    startTransition(async () => { try { await sendFunderSubmissions(fd); setMessage('Submission send completed. Provider-confirmed statuses are in the log.'); setSelected([]); setConfirming(false); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); } });
  }

  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-medium">Funder Submissions</h2><p className="text-sm text-muted-foreground">Admin-only workspace for previewing and sending email submission packages. Live funder delivery is blocked unless the server provider is configured beyond the controlled test sender.</p></div><label className="text-sm font-medium">Priority<select className="ml-2 rounded-md border px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="rush">Rush</option></select></label></div>
    {message ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{message}</div> : null}
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-2">Target</th><th className="p-2">Funder</th><th className="p-2">Recommended</th><th className="p-2">Method</th><th className="p-2">Readiness</th><th className="p-2">Docs</th><th className="p-2">Previous</th><th className="p-2">Last submitted</th><th className="p-2">Guidelines</th></tr></thead><tbody>{previews.map((p) => { const route = routingByName.get(p.funderName); const ready = p.method === 'email' && p.to && !p.previousStatus && p.missingDocuments.length === 0; return <tr key={p.funderId} className="border-t align-top"><td className="p-2"><input type="checkbox" checked={selected.includes(p.funderId)} disabled={p.method !== 'email' || Boolean(p.previousStatus)} onChange={() => toggle(p.funderId)} /></td><td className="p-2 font-medium">{p.funderName}<p className="text-xs text-muted-foreground">{p.to || 'No recipient configured'}</p></td><td className="p-2"><Badge>{route?.fit ?? '—'}</Badge><p className="mt-1 text-xs text-muted-foreground">{route?.summary ?? 'Not routed'}</p></td><td className="p-2">{p.method}</td><td className="p-2"><Badge className={ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}>{ready ? 'Ready' : 'Needs review'}</Badge></td><td className="p-2">{p.missingDocuments.length ? <span className="text-amber-700">Missing {p.missingDocuments.join(', ')}</span> : 'Complete'}</td><td className="p-2">{p.previousStatus ?? 'None'}</td><td className="p-2">{p.lastSubmittedAt ? new Date(p.lastSubmittedAt).toLocaleString() : '—'}</td><td className="p-2"><details><summary className="cursor-pointer text-primary underline">Open</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">Subject: {p.subject}\n\n{p.body}</pre></details></td></tr>; })}</tbody></table></div>
    {confirming ? <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><h3 className="font-semibold text-amber-950">Confirm selected submissions</h3>{selectedPreviews.map((p) => <div key={p.funderId} className="rounded bg-white/70 p-3 text-sm"><p className="font-medium">{p.funderName} → {p.to}</p><p>CC: {p.cc || '—'} · BCC: {p.bcc || '—'}</p><p className="font-medium">{p.subject}</p><pre className="mt-2 whitespace-pre-wrap text-xs">{p.body}</pre><p className="mt-2">Attachments: {p.attachments.map((a) => a.filename).join(', ') || 'None'}</p>{p.missingDocuments.length ? <p className="text-red-700">Missing: {p.missingDocuments.join(', ')}</p> : null}</div>)}<Button disabled={!canSend || isPending} onClick={send}>{isPending ? 'Sending…' : 'Send Selected Submissions'}</Button></div> : <Button disabled={!selected.length} onClick={() => setConfirming(true)}>Preview / Confirm Selected</Button>}
  </Card>;
}
