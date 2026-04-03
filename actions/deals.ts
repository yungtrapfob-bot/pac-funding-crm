'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

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
  follow_up_status: z.string().default('pending'),
  outcome_tag: z.string().optional()
});

export async function createHotLead(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const parsed = hotLeadSchema.parse(Object.fromEntries(formData));
  const { error } = await supabase.from('hot_leads').insert({
    ...parsed,
    assigned_rep_id: user.id,
    last_contact_date: new Date().toISOString().slice(0, 10)
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/hot-leads/new');
}

export async function createDeal(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const payload = Object.fromEntries(formData);
  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      business_name: payload.business_name,
      owner_name: payload.owner_name,
      phone: payload.phone,
      email: payload.email,
      industry: payload.industry,
      monthly_revenue: Number(payload.monthly_revenue),
      time_in_business_months: Number(payload.time_in_business_months),
      state: payload.state,
      positions: Number(payload.positions),
      nsf_count: Number(payload.nsf_count),
      deposits: Number(payload.deposits),
      fico: Number(payload.fico),
      notes: payload.notes,
      internal_notes: payload.internal_notes,
      assigned_rep_id: user.id,
      current_stage: 'Application Submitted'
    })
    .select('id')
    .single();

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

  await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/notify-processing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId: deal.id })
  });

  revalidatePath('/dashboard');
}

export async function addOffer(formData: FormData) {
  const supabase = createClient();
  const payload = Object.fromEntries(formData);

  const { error } = await supabase.from('offers').insert({
    deal_id: payload.deal_id,
    funder: payload.funder,
    approval_amount: Number(payload.approval_amount),
    term: payload.term,
    payment_frequency: payload.payment_frequency,
    factor_rate: Number(payload.factor_rate),
    payment_amount: Number(payload.payment_amount),
    stipulations: payload.stipulations,
    expiration_date: payload.expiration_date,
    notes: payload.notes,
    status: payload.status
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${payload.deal_id}`);
}

export async function updateDealStage(formData: FormData) {
  const supabase = createClient();
  const payload = Object.fromEntries(formData);
  const isFunded = payload.current_stage === 'Funded';

  const { error } = await supabase
    .from('deals')
    .update({
      current_stage: payload.current_stage,
      funded_date: isFunded ? new Date().toISOString().slice(0, 10) : null
    })
    .eq('id', String(payload.deal_id));

  if (error) throw new Error(error.message);

  if (isFunded) {
    await supabase.rpc('sync_commissions_for_deal', { target_deal_id: payload.deal_id });
  }

  revalidatePath(`/deals/${payload.deal_id}`);
  revalidatePath('/admin/pipeline');
}
