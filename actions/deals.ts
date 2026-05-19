'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const followUpStatusSchema = z.enum(['pending', 'contacted', 'scheduled', 'stale']);

const hotLeadSchema = z.object({
  business_name: z.string().min(2),
  owner_name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email(),
  industry: z.string().min(2),
  monthly_revenue: z.coerce.number().nonnegative(),
  time_in_business_months: z.coerce.number().nonnegative(),
  state: z.string().min(2),
  positions: z.coerce.number().nonnegative(),
  nsf_count: z.coerce.number().nonnegative(),
  deposits: z.coerce.number().nonnegative(),
  fico: z.coerce.number().min(300).max(850),
  notes: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  follow_up_status: followUpStatusSchema.default('pending'),
  outcome_tag: z.string().optional()
});

export type HotLeadFormState = {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function createHotLead(_: HotLeadFormState, formData: FormData): Promise<HotLeadFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Unauthorized' };

  const parsed = hotLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: 'error', message: 'Please fix the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { next_follow_up_date, ...rest } = parsed.data;
  const normalizedFollowUpDate = next_follow_up_date ? new Date(next_follow_up_date).toISOString() : null;
  const { data: lead, error } = await supabase.from('hot_leads').insert({
    ...rest,
    next_follow_up_date: normalizedFollowUpDate,
    assigned_rep_id: user.id,
    last_contact_date: new Date().toISOString().slice(0, 10)
  }).select('id').single();

  if (error || !lead) return { status: 'error', message: error?.message ?? 'Failed to create lead.' };

  revalidatePath('/dashboard');
  revalidatePath('/hot-leads/new');
  revalidatePath('/hot-leads');
  redirect(`/hot-leads/${lead.id}?created=1`);
}

export async function updateHotLead(formData: FormData) {
  const supabase = await createClient();
  const payload = Object.fromEntries(formData);
  const { error } = await supabase
    .from('hot_leads')
    .update({
      business_name: payload.business_name,
      owner_name: payload.owner_name,
      phone: payload.phone,
      email: payload.email,
      follow_up_status: followUpStatusSchema.parse(payload.follow_up_status),
      next_follow_up_date: payload.next_follow_up_date ? new Date(String(payload.next_follow_up_date)).toISOString() : null,
      notes: payload.notes,
      last_contact_date: new Date().toISOString().slice(0, 10)
    })
    .eq('id', String(payload.id));
  if (error) throw new Error(error.message);

  revalidatePath('/hot-leads');
  revalidatePath(`/hot-leads/${payload.id}`);
  revalidatePath('/dashboard');
}

export async function createDeal(formData: FormData) { /* unchanged */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const payload = Object.fromEntries(formData);
  const { data: deal, error } = await supabase.from('deals').insert({ business_name: payload.business_name, owner_name: payload.owner_name, phone: payload.phone, email: payload.email, industry: payload.industry, monthly_revenue: Number(payload.monthly_revenue), time_in_business_months: Number(payload.time_in_business_months), state: payload.state, positions: Number(payload.positions), nsf_count: Number(payload.nsf_count), deposits: Number(payload.deposits), fico: Number(payload.fico), notes: payload.notes, internal_notes: payload.internal_notes, assigned_rep_id: user.id, current_stage: 'Application Submitted' }).select('id').single();
  if (error || !deal) throw new Error(error?.message || 'Failed to create deal');
  const appFile = formData.get('application_file') as File;
  if (appFile?.size) {
    const path = `${deal.id}/application-${Date.now()}-${appFile.name}`;
    const upload = await supabase.storage.from('deal-files').upload(path, appFile, { upsert: true });
    if (upload.error) throw new Error(upload.error.message);
    await supabase.from('deal_files').insert({ deal_id: deal.id, file_type: 'application', path });
  }
  const bankFiles = formData.getAll('bank_statements') as File[];
  for (const file of bankFiles) {
    if (!file?.size) continue;
    const path = `${deal.id}/statement-${Date.now()}-${file.name}`;
    const upload = await supabase.storage.from('deal-files').upload(path, file, { upsert: true });
    if (upload.error) throw new Error(upload.error.message);
    await supabase.from('deal_files').insert({ deal_id: deal.id, file_type: 'bank_statement', path });
  }
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/notify-processing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dealId: deal.id }) });
  revalidatePath('/dashboard');
  revalidatePath('/deals');
}

export async function updateDealDetails(formData: FormData) {
  const supabase = await createClient();
  const payload = Object.fromEntries(formData);
  const { error } = await supabase
    .from('deals')
    .update({
      notes: payload.notes,
      internal_notes: payload.internal_notes,
      funded_amount: Number(payload.funded_amount ?? 0),
      gross_commission: Number(payload.gross_commission ?? 0),
      gross_psf: Number(payload.gross_psf ?? 0)
    })
    .eq('id', String(payload.deal_id));
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${payload.deal_id}`);
  revalidatePath('/admin/pipeline');
}

export async function addOffer(formData: FormData) {
  const supabase = await createClient();
  const payload = Object.fromEntries(formData);
  const { error } = await supabase.from('offers').insert({ deal_id: payload.deal_id, funder: payload.funder, approval_amount: Number(payload.approval_amount), term: payload.term, payment_frequency: payload.payment_frequency, factor_rate: Number(payload.factor_rate), payment_amount: Number(payload.payment_amount), stipulations: payload.stipulations, expiration_date: payload.expiration_date, notes: payload.notes, status: payload.status });
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${payload.deal_id}`);
}

export async function updateDealStage(formData: FormData) {
  const supabase = await createClient();
  const payload = Object.fromEntries(formData);
  const isFunded = payload.current_stage === 'Funded';
  const { error } = await supabase.from('deals').update({ current_stage: payload.current_stage, funded_date: isFunded ? new Date().toISOString().slice(0, 10) : null }).eq('id', String(payload.deal_id));
  if (error) throw new Error(error.message);
  if (isFunded) await supabase.rpc('sync_commissions_for_deal', { target_deal_id: payload.deal_id });
  revalidatePath(`/deals/${payload.deal_id}`);
  revalidatePath('/admin/pipeline');
  revalidatePath('/deals');
  revalidatePath('/dashboard');
}
