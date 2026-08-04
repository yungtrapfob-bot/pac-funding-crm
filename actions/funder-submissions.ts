'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getEmailProvider } from '@/lib/email-provider';
import { buildPreview, downloadAttachments, selectedPackageFiles } from '@/lib/funder-submissions';

export async function sendFunderSubmissions(formData: FormData) {
  const { profile } = await requireRole(['admin']);
  const dealId = String(formData.get('deal_id') ?? '');
  const priority = String(formData.get('priority') ?? 'normal');
  const funderIds = formData.getAll('funder_id').map(String).filter(Boolean);
  if (!dealId || funderIds.length === 0) throw new Error('Select at least one funder.');

  const supabase = await createClient();
  const [{ data: deal }, { data: funders }, { data: files }, { data: logs }] = await Promise.all([
    supabase.from('deals').select('*, assigned_rep:assigned_rep_id(full_name)').eq('id', dealId).single(),
    supabase.from('funder_master').select('*').in('id', funderIds),
    supabase.from('deal_files').select('*').eq('deal_id', dealId),
    supabase.from('funder_submission_logs').select('*').eq('deal_id', dealId).in('funder_id', funderIds)
  ]);
  if (!deal) throw new Error('Deal not found.');

  const previousByFunder = new Map((logs ?? []).map((log) => [log.funder_id, log]));
  const provider = getEmailProvider();

  for (const funder of funders ?? []) {
    if (funder.submission_method !== 'email') throw new Error(`${funder.funder_name} is not configured for email submissions.`);
    if (!funder.is_active) throw new Error(`${funder.funder_name} is inactive.`);
    const preview = buildPreview(deal, funder, files ?? [], previousByFunder.get(funder.id));
    if (!preview.to) throw new Error(`${funder.funder_name} is missing a primary submission email.`);
    if (preview.missingDocuments.length) throw new Error(`${funder.funder_name} is missing required docs: ${preview.missingDocuments.join(', ')}`);

    const filenames = selectedPackageFiles(files ?? []).map((file) => preview.attachments.find((a) => a.id === file.id)?.filename ?? file.path);
    const { data: inserted, error: insertError } = await supabase.from('funder_submission_logs').insert({
      deal_id: dealId, funder_id: funder.id, funder_name: funder.funder_name, submission_method: 'email', recipient: preview.to,
      cc: preview.cc || null, bcc: preview.bcc || null, subject: preview.subject, body: preview.body, filenames_attached: filenames,
      submitted_by: profile.id, status: 'queued', priority, idempotency_key: preview.idempotencyKey
    }).select('id').single();
    if (insertError) throw new Error(`Duplicate or failed submission for ${funder.funder_name}: ${insertError.message}`);

    try {
      await supabase.from('funder_submission_logs').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', inserted.id);
      const attachments = await downloadAttachments(supabase, files ?? []);
      const result = await provider.sendEmail({ to: preview.to, cc: preview.cc, bcc: preview.bcc, subject: preview.subject, body: preview.body, attachments, idempotencyKey: preview.idempotencyKey });
      await supabase.from('funder_submission_logs').update({ status: 'sent', provider_message_id: result.messageId, updated_at: new Date().toISOString() }).eq('id', inserted.id);
    } catch (error) {
      await supabase.from('funder_submission_logs').update({ status: 'failed', error_details: error instanceof Error ? error.message : String(error), retry_count: 1, updated_at: new Date().toISOString() }).eq('id', inserted.id);
      throw error;
    }
  }

  revalidatePath(`/deals/${dealId}`);
}
