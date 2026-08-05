'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizeSubmissionMethod } from '@/lib/funder-routing';

function funderKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

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
  const { error } = await supabase.from('funder_submission_configs').upsert({
    funder_key: key,
    funder_name: funderName,
    submission_method: submissionMethod,
    primary_submission_email: String(formData.get('primary_submission_email') ?? '').trim() || null,
    submission_cc: String(formData.get('submission_cc') ?? '').trim() || null,
    submission_bcc: String(formData.get('submission_bcc') ?? '').trim() || null,
    subject_template: String(formData.get('subject_template') ?? '').trim() || 'Submission: {{business_name}} - {{requested_amount}} - {{state}}',
    body_template: String(formData.get('body_template') ?? '').trim(),
    required_document_types: required_document_types.length ? required_document_types : ['application', 'statement'],
    internal_submission_notes: String(formData.get('internal_submission_notes') ?? '').trim() || null,
    is_active: formData.get('is_active') === 'on',
    updated_at: new Date().toISOString()
  }, { onConflict: 'funder_key' });

  if (error) {
    console.error('Failed to save funder submission config', { funder_key: key, funder_name: funderName, code: error.code, message: error.message, details: error.details });
    redirect(`/admin/funders?configError=save-failed&funder=${encodeURIComponent(funderName)}`);
  }

  revalidatePath('/admin/funders');
  redirect(`/admin/funders?configSaved=${encodeURIComponent(funderName)}`);
}
