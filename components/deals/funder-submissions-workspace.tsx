'use client';

import { useState, useTransition } from 'react';
import { previewProcessingSubmissions, reconcileProcessingSubmission, sendProcessingSubmissions } from '@/actions/funder-submissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

type Preview = Awaited<ReturnType<typeof previewProcessingSubmissions>>[number];
type Routing = { funderId?: string; fit: string; summary: string; reasons: { message: string }[]; guidelines: { label: string; value: string }[] };
type Document = { id: string; fileType: string | null; filename: string };
type History = { id: string; funder_id: string; status: string; provider_message_id: string | null };

const isPortal = (method: string) => ['portal', 'manual_portal'].includes(method);
const fitNames: Record<string, string> = { YES: 'GO', MAYBE: 'MAYBE', NO: 'NO' };
const tones: Record<string, string> = {
  YES: 'bg-emerald-50 text-emerald-900', MAYBE: 'bg-amber-50 text-amber-900', NO: 'bg-red-50 text-red-900',
};

export function FunderSubmissionsWorkspace({ dealId, previews, routingResults, documents, history, mode, readOnly }: {
  dealId: string; previews: Preview[]; routingResults: Routing[];
  documents: Document[]; history: History[]; mode: string; readOnly: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Preview[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [portalConfirmed, setPortalConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const routingById = new Map(routingResults.map((result, index) => [result.funderId, { result, index }]));
  const sorted = [...previews].sort((a,b) => (routingById.get(a.funderId)?.index ?? Infinity) - (routingById.get(b.funderId)?.index ?? Infinity));
  const input = { dealId, targets: selected.map(id => ({ id, extraIds: extras })) };
  const hasPortal = confirmed.some(item => isPortal(item.method));
  const canConfirm = confirmed.length > 0 && (!hasPortal || portalConfirmed)
    && confirmed.every(item => item.missingDocuments.length === 0)
    && (!confirmed.some(item => routingById.get(item.funderId)?.result.fit === 'MAYBE') || Boolean(review.trim()));

  function run(work: () => Promise<void>) {
    setNotice([]);
    startTransition(async () => {
      try { await work(); } catch (error) {
        setNotice([error instanceof Error ? error.message : 'The request could not be completed.']);
      }
    });
  }

  return <Card id="funder-submissions" className="space-y-3">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-semibold">Recommendations and submissions</h2>
        <p className="text-xs text-muted-foreground">Recommendations use the saved guidelines and underwriting inputs.</p>
      </div>
      <div className="flex gap-1 text-xs">
        {Object.entries(fitNames).map(([fit, label]) => <span className={`rounded px-2 py-1 ${tones[fit]}`} key={fit}>
          {label} {routingResults.filter(result => result.fit === fit).length}
        </span>)}
      </div>
    </header>
    <p className="text-sm text-muted-foreground">{readOnly ? 'This deal is closed to new submissions.' : mode === 'test'
      ? 'Controlled mock email is available for test deals.' : mode === 'resend-pilot' ? 'Pilot email is limited to synthetic deals and the configured test inbox.'
      : mode === 'resend' ? 'Live email requires authorization for each reviewed package.'
        : 'Email delivery is disabled. Verified portals can be recorded manually.'}</p>
    {!!notice.length && <ul role="status" className="rounded border border-border bg-muted/40 p-2 text-sm">{notice.map(message => <li key={message}>{message}</li>)}</ul>}
    <div className="max-h-[28rem] overflow-auto rounded border border-border">
      <table className="w-full min-w-[675px] text-left text-sm">
        <thead className="sticky top-0 bg-muted text-xs"><tr>
          {['Select','Funder','Fit and guidelines','Method','Readiness','History'].map(label => <th key={label} scope="col" className="px-2 py-2">{label}</th>)}
        </tr></thead>
        <tbody>{sorted.map(item => {
          const routing = routingById.get(item.funderId)?.result;
          const selectable = !readOnly && Boolean(item.verifiedAt) && routing?.fit !== 'NO'
            && (item.method === 'email' ? mode !== 'disabled' : isPortal(item.method))
            && (!item.previousStatus || item.previousStatus === 'failed');
          const reconcile = history.find(log => log.funder_id === item.funderId && log.status === 'sending' && log.provider_message_id);
          return <tr key={item.funderId} className="border-t border-border align-top">
            <td className="p-2"><input aria-label={`Select ${item.funderName}`} type="checkbox"
              checked={selected.includes(item.funderId)} disabled={!selectable || pending || (!selected.includes(item.funderId) && selected.length >= 8)}
              onChange={() => {
                setConfirmed([]);
                setSelected(current => current.includes(item.funderId) ? current.filter(id => id !== item.funderId) : [...current, item.funderId]);
              }} /></td>
            <td className="p-2 font-medium">{item.funderName}</td>
            <td className="p-2">
              {routing && <><span className={`rounded px-1.5 py-0.5 text-xs ${tones[routing.fit]}`}>{fitNames[routing.fit]}</span>
                <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary">Guidelines</summary>
                  <p className="py-1">{routing.summary}</p><ul className="list-disc pl-4">{routing.reasons.map((reason, index) => <li key={index}>{reason.message}</li>)}</ul>
                  <dl className="mt-2 space-y-1">{routing.guidelines.map(item => <div key={item.label}>
                    <dt className="font-medium">{item.label}</dt><dd className="break-words text-muted-foreground">{item.value}</dd>
                  </div>)}</dl>
                </details>
              </>}
            </td>
            <td className="p-2">{item.method.replaceAll('_',' ')}</td>
            <td className="p-2 text-xs">
              <p>{item.verifiedAt ? 'Destination verified' : 'Verify destination in Funder Master'}</p>
              <p>{item.missingDocuments.length ? `Missing from package: ${item.missingDocuments.join(', ')}` : 'Required document types present'}</p>
            </td>
            <td className="p-2 text-xs">
              {item.previousStatus === 'sending' ? 'In progress or needs reconciliation' : item.previousStatus === 'sent' ? (isPortal(item.method) ? 'Portal recorded' : 'Provider accepted') : item.previousStatus ?? 'No submission'}
              {reconcile && <button disabled={pending} type="button" className="block text-primary hover:underline"
                onClick={() => run(async () => { await reconcileProcessingSubmission(dealId, reconcile.id); setNotice(['Tracker reconciled.']); })}>Update tracker from recorded evidence</button>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!sorted.length && <p className="text-sm text-muted-foreground">No active funders are configured.</p>}
    {!!selected.length && <div className="space-y-2 rounded border border-border p-3">
      <p className="text-sm font-medium">{selected.length} of 8 funders selected</p>
      {!!documents.length && <details><summary className="cursor-pointer text-sm">Include additional documents in the selected packages</summary>
        {documents.map(document => <label className="mt-1 flex gap-2 text-sm" key={document.id}>
          <input type="checkbox" checked={extras.includes(document.id)} disabled={pending} onChange={() => {
            setConfirmed([]);
            setExtras(current => current.includes(document.id) ? current.filter(id => id !== document.id) : [...current, document.id]);
          }} />{document.filename}
        </label>)}
      </details>}
      <Button disabled={pending} onClick={() => run(async () => {
        setPortalConfirmed(false);
        setConfirmed(await previewProcessingSubmissions(input));
      })}>Review selected packages</Button>
    </div>}
    {!!confirmed.length && <div className="space-y-3 rounded border border-border bg-muted/30 p-3">
      <h3 className="font-semibold">Authorize reviewed packages</h3>
      {confirmed.map(item => <details open key={item.funderId} className="space-y-1 rounded bg-card p-3 text-sm">
        <summary className="cursor-pointer font-medium">{item.funderName}</summary>
        {isPortal(item.method) && item.portalUrl ? <a className="block text-primary underline" href={item.portalUrl} target="_blank" rel="noopener noreferrer">Open verified portal</a>
          : <p>To {item.to}{item.cc && ` · CC ${item.cc}`}{item.bcc && ` · BCC ${item.bcc}`}</p>}
        <p className="font-medium">{item.subject}</p>
        <p className="whitespace-pre-wrap break-words text-xs">{item.body}</p>
        <ul className="text-xs">{item.attachments.map(document => <li key={document.id}>
          <Link prefetch={false} className="text-primary underline" href={`/api/deal-files/${document.id}`}>{document.filename}</Link>
        </li>)}</ul>
        {!!item.missingDocuments.length && <p className="text-red-900">Missing {item.missingDocuments.join(', ')}</p>}
      </details>)}
      <label className="grid gap-1 text-sm">Review note for MAYBE recommendations
        <textarea value={review} maxLength={500} onChange={event => setReview(event.target.value)} className="rounded border border-border p-2" />
      </label>
      {hasPortal && <label className="flex gap-2 text-sm"><input type="checkbox" checked={portalConfirmed}
        onChange={event => setPortalConfirmed(event.target.checked)} /> I completed each selected portal submission manually</label>}
      <Button disabled={pending || !canConfirm} onClick={() => run(async () => {
        const results = await sendProcessingSubmissions(input, confirmed.map(item => ({ id: item.funderId, key: item.confirmationKey })), review, portalConfirmed);
        setNotice(results.map(result => `${result.funderName} · ${result.message}`));
        setConfirmed([]);
        setSelected([]);
        setReview('');
        setExtras([]);
      })}>{pending ? 'Working…' : 'Confirm selected submissions'}</Button>
    </div>}
  </Card>;
}
