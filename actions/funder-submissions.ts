'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailMode, EmailRejected, getEmailProvider } from '@/lib/email-provider';
import { readFunderInventory } from '@/lib/funder-inventory';
import { buildPreview, downloadAttachments, selectedPackageFiles } from '@/lib/funder-submissions';
import { evaluateProcessingFunders } from '@/lib/processing-routing';

const inputSchema = z.object({
  dealId: z.guid(),
  targets: z.array(z.object({ id: z.guid(), extraIds: z.array(z.guid()).max(20) })).min(1).max(8),
});
const confirmationSchema = z.array(z.object({ id: z.guid(), key: z.string().length(64) })).min(1).max(8);

async function loadPackages(input: z.input<typeof inputSchema>) {
  const { profile } = await requireRole(['admin']);
  const { dealId, targets } = inputSchema.parse(input);
  if (new Set(targets.map(t => t.id)).size !== targets.length) throw new Error('Select each funder once.');
  const supabase = await createClient();
  const [{ data: deal, error: dealError }, { funders }, { data: files, error: fileError }, { data: logs, error: logError }] = await Promise.all([
    supabase.from('deals').select('*, assigned_rep:assigned_rep_id(full_name)').eq('id', dealId).single(),
    readFunderInventory(supabase),
    supabase.from('deal_files').select('*').eq('deal_id', dealId).order('id'),
    supabase.from('funder_submission_logs').select('*').eq('deal_id', dealId).order('submitted_at', { ascending: false }),
  ]);
  if (dealError || !deal || fileError || logError) throw new Error('The deal or its submission data is unavailable.');
  if (deal.archived_at || deal.sales_lost || ['Funded','Killed','KIF'].includes(deal.current_stage)) {
    throw new Error('This deal is closed for submissions.');
  }
  const fitById = new Map(evaluateProcessingFunders(funders, deal).map(result => [result.funderId, result.fit]));
  const packages = targets.map(target => {
    const funder = funders.find(row => row.id === target.id);
    if (!funder || !funder.is_active || funder.configurationAmbiguous) throw new Error('A selected funder is unavailable.');
    const previous = logs.find(log => log.funder_id === target.id);
    const selected = selectedPackageFiles(files, target.extraIds);
    if (target.extraIds.some(id => !selected.some(file => file.id === id))) throw new Error('A selected document is unavailable.');
    return { preview: buildPreview(deal, funder, files, previous, target.extraIds), selected, previous, fit: fitById.get(target.id) };
  });
  return { profile, deal, supabase, packages };
}

export async function previewProcessingSubmissions(input: z.input<typeof inputSchema>) {
  const { packages } = await loadPackages(input);
  return packages.map(item => item.preview);
}

export async function sendProcessingSubmissions(
  input: z.input<typeof inputSchema>, confirmation: z.input<typeof confirmationSchema>, overrideNote: string, portalConfirmed: boolean,
) {
  const { profile, deal, supabase, packages } = await loadPackages(input);
  const confirmations = confirmationSchema.parse(confirmation);
  const note = z.string().trim().max(500).parse(overrideNote);
  if (confirmations.length !== packages.length || packages.some(({ preview }) =>
    !confirmations.some(item => item.id === preview.funderId && item.key === preview.confirmationKey))) {
    throw new Error('The package changed. Preview it again.');
  }
  const { data: claims } = await supabase.auth.getClaims();
  const actorSession = z.guid().safeParse(claims?.claims?.session_id);
  if (!actorSession.success) throw new Error('Sign in again before authorizing a submission.');
  const admin = createAdminClient();
  const results = [];
  for (const { preview, selected, previous, fit } of packages) {
    const portal = ['portal', 'manual_portal'].includes(preview.method);
    let message: string;
    if (previous && previous.status !== 'failed') message = 'Already submitted or awaiting reconciliation.';
    else if (fit === 'NO') message = 'A mandatory guideline blocks submission.';
    else if (fit === 'MAYBE' && !note) message = 'Document the discretionary review before submitting.';
    else if (!preview.verifiedAt || preview.missingDocuments.length || (deal.application_review_required && !deal.application_reviewed_at)) message = 'Verify the destination and review required documents first.';
    else if (portal ? !portalConfirmed || !preview.portalUrl : preview.method !== 'email' || !preview.to || emailMode() === 'disabled') message = 'This submission method is unavailable or lacks confirmation.';
    else if (!portal && emailMode() === 'resend' && deal.sales_test) message = 'Test records cannot use live delivery.';
    else if (!portal && emailMode() === 'test' && !deal.sales_test) message = 'Test email requires a synthetic deal marked as a test record.';
    else {
      const payload = {
        deal_id: deal.id, funder_id: preview.funderId, funder_name: preview.funderName,
        submission_method: preview.method, recipient: portal ? preview.portalUrl : preview.to,
        cc: preview.cc || null, bcc: preview.bcc || null, subject: preview.subject, body: preview.body,
        filenames_attached: preview.attachments.map(item => item.filename), submitted_by: profile.id,
        status: 'sending', priority: 'normal', idempotency_key: preview.idempotencyKey,
        review_note: note || null, updated_at: new Date().toISOString(),
      };
      const write = previous
        ? admin.from('funder_submission_logs').update({ ...payload, retry_count: (previous.retry_count ?? 0) + 1 }).eq('id', previous.id).eq('status', 'failed')
        : admin.from('funder_submission_logs').insert(payload);
      const { data: entry, error } = await write.select('id').maybeSingle();
      if (error || !entry) message = 'The submission was already claimed or could not be reserved.';
      else {
        let providerStarted = false;
        try {
          let evidence = `portal-${entry.id}`;
          if (!portal) {
            const attachments = await downloadAttachments(supabase, selected);
            const provider = getEmailProvider();
            providerStarted = true;
            evidence = (await provider.sendEmail({ ...preview, attachments })).messageId;
          }
          // Store provider evidence before the atomic tracker update so a failed update can be reconciled.
          const { error: evidenceError } = await admin.from('funder_submission_logs').update({ provider_message_id: evidence }).eq('id', entry.id);
          if (evidenceError) throw new Error('Could not store confirmation.');
          const { error: finalError } = await admin.rpc('crm_complete_processing_submission', {
            log_id: entry.id, evidence_id: evidence, actor_id: profile.id, actor_session_id: actorSession.data,
          });
          if (finalError) throw new Error('Could not update the tracker.');
          message = portal ? 'Portal submission recorded.' : emailMode() === 'test' ? 'Mock provider accepted.' : 'Provider accepted. Delivery is tracked by the provider.';
        } catch (error) {
          const safeRetry = !portal && (!providerStarted || error instanceof EmailRejected);
          await admin.from('funder_submission_logs').update({
            status: safeRetry ? 'failed' : 'sending',
            error_details: safeRetry ? 'Rejected before acceptance.' : 'Acceptance or tracker update requires reconciliation.',
            updated_at: new Date().toISOString(),
          }).eq('id', entry.id);
          message = safeRetry ? 'The package was rejected or could not be prepared. Review before retrying.' : 'Needs reconciliation. Automatic retry is blocked.';
        }
      }
    }
    results.push({ funderName: preview.funderName, message });
  }
  for (const path of [`/deals/${deal.id}`, '/admin/processing', '/dashboard', '/admin', '/performance']) revalidatePath(path);
  return results;
}

export async function reconcileProcessingSubmission(dealId: string, logId: string) {
  const { profile } = await requireRole(['admin']);
  z.guid().parse(dealId);
  z.guid().parse(logId);
  const supabase = await createClient();
  const [{ data: entry }, { data: claims }] = await Promise.all([
    supabase.from('funder_submission_logs').select('id,provider_message_id').eq('id', logId).eq('deal_id', dealId).eq('status', 'sending').maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  const actorSession = z.guid().safeParse(claims?.claims?.session_id);
  if (!entry?.provider_message_id || !actorSession.success) {
    throw new Error('Check the provider for authoritative acceptance evidence before reconciling.');
  }
  const { error } = await createAdminClient().rpc('crm_complete_processing_submission', {
    log_id: entry.id, evidence_id: entry.provider_message_id, actor_id: profile.id, actor_session_id: actorSession.data,
  });
  if (error) throw new Error('Could not reconcile the tracker. Check the deal document review and stage.');
  for (const path of [`/deals/${dealId}`, '/admin/processing', '/dashboard', '/admin', '/performance']) revalidatePath(path);
}
