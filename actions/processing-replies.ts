'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPages } from '@/lib/supabase/read-pages';
import { extractFunderReply, matchFunderReply, type SentSubmission } from '@/lib/funder-replies';
import { gmailProcessingMailbox, mailboxMode, mockProcessingMailbox } from '@/lib/processing-mailbox';

export async function importProcessingReplies(dealId?: string) {
  await requireRole(['admin']);
  if (dealId) z.guid().parse(dealId);
  const mode = mailboxMode();
  if (mode === 'disabled') throw new Error('Mailbox import is disabled.');
  const supabase = await createClient();
  const sent = await readPages<SentSubmission>((from,to) => {
    let query = supabase.from('funder_submission_logs').select('id,deal_id,funder_name,recipient,provider_message_id,idempotency_key')
      .eq('status','sent').order('id');
    if (mode === 'mock' && dealId) query = query.eq('deal_id',dealId);
    return query.range(from,to);
  });
  if (mode === 'mock') {
    if (!dealId) throw new Error('Select a synthetic deal to import mock replies.');
    const { data } = await supabase.from('deals').select('sales_test').eq('id',dealId).single();
    if (!data?.sales_test) throw new Error('Mock replies are limited to synthetic test deals.');
  }
  const mailbox = mode === 'mock' ? mockProcessingMailbox(sent) : gmailProcessingMailbox();
  const messages = await mailbox.read();
  const rows = messages.map(message => {
    const match = matchFunderReply(message, sent, mode === 'mock');
    return {
      provider: mode, external_id: message.id, sender: message.sender, subject: message.subject,
      excerpt: message.text, proposed_submission: match.submissionId, confidence: match.confidence,
      proposal: extractFunderReply(message),
    };
  });
  if (rows.length) {
    const { error } = await createAdminClient().from('processing_funder_responses')
      .upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: true });
    if (error) throw new Error('Could not import mailbox replies.');
  }
  revalidatePath('/admin/processing/responses');
  return rows.length;
}

const numeric = (min: number, max: number) => z.preprocess(
  value => typeof value === 'string' && value.trim() ? Number(value) : null,
  z.number().min(min).max(max).nullable(),
);
const nullableText = z.string().trim().max(350).transform(value => value || null);
const termsSchema = z.object({
  amount: numeric(.01, 9999999999.99), factor: numeric(1,100), payback: numeric(0,9999999999.99), payment: numeric(0,9999999999.99),
  frequency: nullableText, term: nullableText, stipulations: nullableText, declineReason: nullableText,
  expiration: z.union([z.literal(''),z.iso.date()]).transform(value => value || null),
});

export async function reviewProcessingReply(id: string, form: FormData) {
  await requireRole(['admin']);
  z.guid().parse(id);
  const decision = z.enum(['approval','decline','dismiss']).parse(form.get('decision'));
  const submissionId = decision === 'dismiss' ? null : z.guid().parse(form.get('submission'));
  if (decision !== 'dismiss' && form.get('checked') !== 'yes') throw new Error('Verify the sender, deal, and terms first.');
  const terms = decision === 'dismiss' ? {} : termsSchema.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { data: submission } = submissionId
    ? await supabase.from('funder_submission_logs').select('deal_id').eq('id',submissionId).maybeSingle()
    : { data: null };
  const { error } = await supabase.rpc('crm_review_funder_response', {
    response_id: id, submission_id: submissionId, decision, terms,
  });
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Could not apply the reviewed reply.');
  for (const path of ['/admin/processing/responses','/admin/processing','/dashboard','/admin','/performance']) revalidatePath(path);
  if (submission) revalidatePath(`/deals/${submission.deal_id}`);
}
