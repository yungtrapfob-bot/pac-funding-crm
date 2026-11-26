import Link from 'next/link';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { mailboxMode } from '@/lib/processing-mailbox';
import { ProcessingReplyReview, type ReviewReply } from '@/components/admin/processing-reply-review';

export default async function ProcessingResponses({ searchParams }: {
  searchParams: Promise<{ deal?: string }>;
}) {
  await requireRole(['admin']);
  const input = z.guid().safeParse((await searchParams).deal);
  const dealId = input.success ? input.data : undefined;
  const supabase = await createClient();
  const [sent, replies] = await Promise.all([
    supabase.from('funder_submission_logs').select('id,deal_id,funder_name,deals(business_name)').eq('status','sent')
      .order('submitted_at',{ ascending:false }).limit(400),
    supabase.from('processing_funder_responses').select('id,sender,subject,excerpt,proposal,proposed_submission,confidence,status')
      .order('created_at',{ ascending:false }).limit(80),
  ]);
  if (sent.error || replies.error) return <p role="alert">Funder responses are unavailable.</p>;
  const entries = sent.data.map(entry => {
    const relation = Array.isArray(entry.deals) ? entry.deals[0] : entry.deals;
    return { id: entry.id, dealId: entry.deal_id, name: `${relation?.business_name ?? 'Deal'} · ${entry.funder_name}` };
  });
  const visible = (replies.data as ReviewReply[]).filter(reply => !dealId || !reply.proposed_submission
    || entries.some(entry => entry.id === reply.proposed_submission && entry.dealId === dealId));
  return <div className="space-y-3">
    <Link className="text-sm text-primary hover:underline" href={dealId ? `/deals/${dealId}?context=processing` : '/admin/processing'}>Back to processing</Link>
    <h1 className="text-2xl font-semibold">Funder response review</h1>
    <ProcessingReplyReview dealId={dealId} mode={mailboxMode()} replies={visible} submissions={entries} />
  </div>;
}
