'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizeSubmissionMethod } from '@/lib/funder-routing';

export async function updateFunderSubmissionConfig(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const required_document_types = String(formData.get('required_document_types') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const { error } = await supabase.from('funder_master').update({
    submission_method: normalizeSubmissionMethod(String(formData.get('submission_method') ?? 'tbd')) === 'tbd' ? 'unknown_tbd' : normalizeSubmissionMethod(String(formData.get('submission_method') ?? 'tbd')),
    primary_submission_email: String(formData.get('primary_submission_email') ?? '').trim() || null,
    submission_cc: String(formData.get('submission_cc') ?? '').trim() || null,
    submission_bcc: String(formData.get('submission_bcc') ?? '').trim() || null,
    subject_template: String(formData.get('subject_template') ?? '').trim(),
    body_template: String(formData.get('body_template') ?? '').trim(),
    required_document_types,
    internal_submission_notes: String(formData.get('internal_submission_notes') ?? '').trim() || null,
    is_active: formData.get('is_active') === 'on',
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/funders');
}
