'use client';

import { useState, useTransition } from 'react';
import { importProcessingReplies, reviewProcessingReply } from '@/actions/processing-replies';
import type { extractFunderReply } from '@/lib/funder-replies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ReviewReply = {
  id: string; sender: string; subject: string; excerpt: string; proposed_submission: string | null;
  confidence: string; status: string; proposal: ReturnType<typeof extractFunderReply>;
};
const fields = {
  amount: 'Approved amount', factor: 'Factor rate', payback: 'Total payback', payment: 'Payment amount',
  frequency: 'Payment frequency', term: 'Term', expiration: 'Expiration date', stipulations: 'Stipulations', declineReason: 'Decline reason',
} as const;
const confidenceLabels: Record<string,string> = {
  verified_reference: 'Matched by verified reference', reference_needs_sender_review: 'Reference found · Verify sender',
  manual: 'Unmatched · Select the correct submission manually',
};

export function ProcessingReplyReview({ dealId, mode, replies, submissions }: {
  dealId?: string; mode: string; replies: ReviewReply[]; submissions: { id: string; name: string }[];
}) {
  const [message,setMessage] = useState('');
  const [pending,startTransition] = useTransition();
  function run(operation: () => Promise<string>) {
    setMessage('');
    startTransition(async () => {
      try { setMessage(await operation()); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'The response could not be processed.'); }
    });
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <p className="text-sm text-muted-foreground">Mailbox import is {mode === 'disabled' ? 'disabled' : mode === 'mock' ? 'in controlled mock mode' : 'read-only Gmail'}.</p>
      <Button disabled={pending || mode === 'disabled' || (mode === 'mock' && !dealId)} onClick={() =>
        run(async () => `Examined ${await importProcessingReplies(dealId)} messages. Existing replies were retained.`)}>
        Import funder replies
      </Button>
    </div>
    {message && <p role="status" className="rounded bg-muted p-2 text-sm">{message}</p>}
    {!replies.length && <p className="rounded border border-border bg-card p-3 text-sm text-muted-foreground">No responses to review.</p>}
    {replies.map(reply => <details key={reply.id} className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">{reply.subject || 'Untitled reply'} · {reply.status}</summary>
      <div className="mt-3 space-y-2 text-sm">
        <p>From {reply.sender || 'unknown'} · {confidenceLabels[reply.confidence]}</p>
        <p>Suggested response · {reply.proposal.kind.replaceAll('_',' ')}</p>
        {(reply.proposal.conditional || reply.proposal.mismatch) && <p className="text-amber-900">Review conditional language or inconsistent figures before applying terms.</p>}
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-xs">{reply.excerpt}</pre>
        {reply.status === 'review' && <form className="space-y-2" onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(async () => { await reviewProcessingReply(reply.id,form); return 'Reviewed response recorded.'; });
        }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">Confirmed submission
              <select className="rounded border border-border p-2" name="submission" defaultValue={reply.proposed_submission ?? ''}>
                <option value="">Choose a deal and funder</option>
                {submissions.map(submission => <option key={submission.id} value={submission.id}>{submission.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs">Review decision
              <select className="rounded border border-border p-2" name="decision" defaultValue="">
                <option value="" disabled>Select one</option>
                <option value="approval">Record approval</option><option value="decline">Record decline</option><option value="dismiss">Dismiss reply</option>
              </select>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(fields) as (keyof typeof fields)[]).map(field => <label key={field} className="grid gap-1 text-xs">
              {fields[field]}<Input name={field} defaultValue={reply.proposal[field] ?? ''} />
            </label>)}
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="checked" value="yes" /> I verified the sender, deal, and offer terms</label>
          <Button disabled={pending} type="submit">Save reviewed response</Button>
        </form>}
      </div>
    </details>)}
  </div>;
}
