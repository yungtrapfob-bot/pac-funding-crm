'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { readFunderInventory, funderKey } from '@/lib/funder-inventory';
import { normalizeSubmissionMethod } from '@/lib/funder-routing';

export async function updateFunderSubmissionConfig(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const funderName = String(formData.get('funder_name') ?? '').trim();
  const key = String(formData.get('funder_key') ?? funderKey(funderName)).trim();

  if (!funderName || !key) {
    redirect('/admin/funders?configError=missing-funder');
  }

  const submissionMethod = normalizeSubmissionMethod(String(formData.get('submission_method') ?? 'tbd'));
  const required_document_types = String(formData.get('required_document_types') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const master = (await readFunderInventory(supabase)).funders.find(row => row.key === key);
  const primary = String(formData.get('primary_submission_email') ?? '').trim();
  const cc = String(formData.get('submission_cc') ?? '').trim();
  const bcc = String(formData.get('submission_bcc') ?? '').trim();
  const portal = String(formData.get('portal_url') ?? '').trim();
  const portalUrl = z.url({ protocol: /^https$/ }).safeParse(portal);
  const validPortal = portalUrl.success && !new URL(portalUrl.data).username && !new URL(portalUrl.data).password;
  const verify = formData.get('verify_destination') === 'on';
  const emailValid = [primary, ...cc.split(','), ...bcc.split(',')].every(address => !address.trim() || z.email().safeParse(address.trim()).success);
  const verificationAllowed = submissionMethod === 'email' ? Boolean(primary) && emailValid
    : ['portal', 'manual_portal'].includes(submissionMethod) && validPortal;
  if (!master || master.configurationAmbiguous || !emailValid || (portal && !validPortal) || (verify && !verificationAllowed)) {
    redirect(`/admin/funders?configError=invalid-destination&funder=${encodeURIComponent(funderName)}`);
  }
  const { error } = await supabase.from('funder_submission_configs').upsert({
    funder_key: key,
    funder_name: master.funder_name,
    portal_url: portal || null,
    verified_at: verify ? new Date().toISOString() : null,
    submission_method: submissionMethod,
    primary_submission_email: primary || null,
    submission_cc: cc || null,
    submission_bcc: bcc || null,
    subject_template: String(formData.get('subject_template') ?? '').trim() || 'Submission: {{business_name}} - {{requested_amount}} - {{state}}',
    body_template: String(formData.get('body_template') ?? '').trim(),
    required_document_types: required_document_types.length ? required_document_types : ['application', 'statement'],
    internal_submission_notes: String(formData.get('internal_submission_notes') ?? '').trim() || null,
    is_active: master.masterActive && formData.get('is_active') === 'on',
    updated_at: new Date().toISOString()
  }, { onConflict: 'funder_key' });

  if (error) {
    console.error('Failed to save funder submission config', { code: error.code });
    redirect(`/admin/funders?configError=save-failed&funder=${encodeURIComponent(funderName)}`);
  }

  revalidatePath('/admin/funders');
  redirect(`/admin/funders?configSaved=${encodeURIComponent(funderName)}`);
}
