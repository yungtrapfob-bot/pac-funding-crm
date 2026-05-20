'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { addBusinessDays, calculateFiftyPercentPaidDate } from '@/lib/utils';

const followUpStatusSchema = z.enum(['pending', 'contacted', 'scheduled', 'stale']);

const hotLeadSchema = z.object({ business_name: z.string().min(2), owner_name: z.string().min(2), phone: z.string().min(7), email: z.string().email(), industry: z.string().min(2), monthly_revenue: z.coerce.number().nonnegative(), time_in_business_months: z.coerce.number().nonnegative(), state: z.string().min(2), positions: z.coerce.number().nonnegative(), nsf_count: z.coerce.number().nonnegative(), deposits: z.coerce.number().nonnegative(), fico: z.coerce.number().min(300).max(850), notes: z.string().optional(), next_follow_up_date: z.string().optional(), follow_up_status: followUpStatusSchema.default('pending'), outcome_tag: z.string().optional() });
export type HotLeadFormState = { status: 'idle' | 'error'; message?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function createHotLead(_: HotLeadFormState, formData: FormData): Promise<HotLeadFormState> { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { status: 'error', message: 'Unauthorized' }; const parsed = hotLeadSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { status: 'error', message: 'Please fix the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors }; const { next_follow_up_date, ...rest } = parsed.data; const { data: lead, error } = await supabase.from('hot_leads').insert({ ...rest, next_follow_up_date: next_follow_up_date ? new Date(next_follow_up_date).toISOString() : null, assigned_rep_id: user.id, last_contact_date: new Date().toISOString().slice(0, 10) }).select('id').single(); if (error || !lead) return { status: 'error', message: error?.message ?? 'Failed to create lead.' }; revalidatePath('/dashboard'); revalidatePath('/hot-leads'); redirect(`/hot-leads/${lead.id}?created=1`); }

export async function updateHotLead(formData: FormData) { const supabase = await createClient(); const p = Object.fromEntries(formData); const { error } = await supabase.from('hot_leads').update({ business_name: p.business_name, owner_name: p.owner_name, phone: p.phone, email: p.email, follow_up_status: followUpStatusSchema.parse(p.follow_up_status), next_follow_up_date: p.next_follow_up_date ? new Date(String(p.next_follow_up_date)).toISOString() : null, notes: p.notes, outcome_tag: p.outcome_tag, last_contact_date: new Date().toISOString().slice(0, 10) }).eq('id', String(p.id)); if (error) throw new Error(error.message); revalidatePath('/hot-leads'); revalidatePath(`/hot-leads/${p.id}`); }

export async function convertHotLeadToDeal(formData: FormData) { const supabase = await createClient(); const leadId = String(formData.get('hot_lead_id')); const { data: lead, error } = await supabase.from('hot_leads').select('*').eq('id', leadId).single(); if (error || !lead) throw new Error('Lead not found'); const { data: existingDeal } = await supabase.from('activities').select('deal_id').eq('hot_lead_id', lead.id).eq('activity_type', 'hot_lead_converted').order('created_at', { ascending: false }).limit(1).maybeSingle(); if (existingDeal?.deal_id) { redirect(`/deals/${existingDeal.deal_id}`); } const { data: deal, error: dealErr } = await supabase.from('deals').insert({ business_name: lead.business_name, owner_name: lead.owner_name, phone: lead.phone, email: lead.email, industry: lead.industry, monthly_revenue: lead.monthly_revenue, time_in_business_months: lead.time_in_business_months, state: lead.state, positions: lead.positions, nsf_count: lead.nsf_count, deposits: lead.deposits, fico: lead.fico, notes: lead.notes, assigned_rep_id: lead.assigned_rep_id }).select('id').single(); if (dealErr || !deal) throw new Error(dealErr?.message ?? 'Failed to convert lead'); const { data: { user } } = await supabase.auth.getUser(); if (user?.id) { await supabase.from('activities').insert({ hot_lead_id: lead.id, deal_id: deal.id, actor_id: user.id, activity_type: 'hot_lead_converted', details: { source: 'quick_convert' } }); } revalidatePath('/dashboard'); revalidatePath('/hot-leads'); revalidatePath('/deals'); redirect(`/deals/${deal.id}`); }

export type ConvertLeadFormState = {
  status: 'idle' | 'error';
  message?: string;
};

export async function startHotLeadConversion(formData: FormData) {
  const leadId = String(formData.get('hot_lead_id') ?? '');
  redirect(`/hot-leads/${leadId}/convert`);
}

export async function submitHotLeadConversion(
  _: ConvertLeadFormState,
  formData: FormData
): Promise<ConvertLeadFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Unauthorized. Please sign in again.' };

  const leadId = String(formData.get('hot_lead_id') ?? '');
  const { data: lead, error: leadError } = await supabase.from('hot_leads').select('id,assigned_rep_id').eq('id', leadId).maybeSingle();
  if (leadError || !lead) return { status: 'error', message: 'Hot lead not found or inaccessible.' };

  const { data: existingDeal } = await supabase.from('activities').select('deal_id').eq('hot_lead_id', lead.id).eq('activity_type', 'hot_lead_converted').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingDeal?.deal_id) redirect(`/deals/${existingDeal.deal_id}`);

  const payload = {
    business_name: String(formData.get('business_name') ?? ''),
    owner_name: String(formData.get('owner_name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    industry: String(formData.get('industry') ?? ''),
    monthly_revenue: Number(formData.get('monthly_revenue') ?? 0),
    time_in_business_months: Number(formData.get('time_in_business_months') ?? 0),
    state: String(formData.get('state') ?? ''),
    positions: Number(formData.get('positions') ?? 0),
    nsf_count: Number(formData.get('nsf_count') ?? 0),
    deposits: Number(formData.get('deposits') ?? 0),
    fico: Number(formData.get('fico') ?? 0),
    notes: String(formData.get('notes') ?? ''),
    internal_notes: String(formData.get('internal_notes') ?? ''),
    assigned_rep_id: lead.assigned_rep_id
  };

  const { data: deal, error: dealError } = await supabase.from('deals').insert(payload).select('id').single();
  if (dealError || !deal) return { status: 'error', message: dealError?.message ?? 'Unable to create deal from intake.' };

  const { error: activityError } = await supabase.from('activities').insert({
    hot_lead_id: lead.id,
    deal_id: deal.id,
    actor_id: user.id,
    activity_type: 'hot_lead_converted',
    details: { source: 'underwriting_intake' }
  });
  if (activityError) return { status: 'error', message: `Deal created, but conversion link could not be recorded: ${activityError.message}` };

  const files: Array<{ file: File; type: string }> = [];
  const applicationFile = formData.get('application_file');
  if (applicationFile instanceof File && applicationFile.size > 0) files.push({ file: applicationFile, type: 'application' });
  const statementFiles = formData.getAll('bank_statements');
  for (const value of statementFiles) {
    if (value instanceof File && value.size > 0) files.push({ file: value, type: 'statement' });
  }

  for (const entry of files) {
    const filePath = `${deal.id}/${Date.now()}-${entry.file.name.replace(/\s+/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('deal-files').upload(filePath, entry.file, { upsert: false });
    if (uploadError) return { status: 'error', message: `Deal created, but file upload failed: ${uploadError.message}` };
    const { error: insertFileError } = await supabase.from('deal_files').insert({ deal_id: deal.id, file_type: entry.type, path: filePath });
    if (insertFileError) return { status: 'error', message: `Deal created, but file metadata save failed: ${insertFileError.message}` };
  }

  revalidatePath('/dashboard');
  revalidatePath('/hot-leads');
  revalidatePath('/deals');
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}?converted=1`);
}

export async function createDeal(formData: FormData) { /* unchanged */
 const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Unauthorized'); const payload = Object.fromEntries(formData); const { error } = await supabase.from('deals').insert({ business_name: payload.business_name, owner_name: payload.owner_name, phone: payload.phone, email: payload.email, industry: payload.industry, monthly_revenue: Number(payload.monthly_revenue), time_in_business_months: Number(payload.time_in_business_months), state: payload.state, positions: Number(payload.positions), nsf_count: Number(payload.nsf_count), deposits: Number(payload.deposits), fico: Number(payload.fico), notes: payload.notes, internal_notes: payload.internal_notes, assigned_rep_id: user.id }); if (error) throw new Error(error.message); revalidatePath('/deals'); }

export async function updateDealDetails(formData: FormData) {
 const supabase = await createClient(); const p = Object.fromEntries(formData);
 const fundedDate = p.funded_date ? String(p.funded_date) : null;
 const fundedAmount = Number(p.funded_amount || 0);
 const grossCommission = Number(p.gross_commission || 0);
 const termPayments = Number(p.selected_offer_term_payments || 0);
 const paymentFrequency = String(p.selected_offer_payment_frequency || '');
 const fiftyDate = calculateFiftyPercentPaidDate({ fundedDate, termPayments, paymentFrequency });
 const commissionDate = fundedDate ? addBusinessDays(fundedDate, 30) : null;
 const updatePayload = { notes: p.notes, internal_notes: p.internal_notes, application_complete: p.application_complete === 'on', docs_collected: p.docs_collected === 'on', submission_ready: p.submission_ready === 'on', underwriting_notes: p.underwriting_notes, dl_received: p.dl_received === 'on', voided_check_received: p.voided_check_received === 'on', contracts_sent_date: p.contracts_sent_date || null, funded_date: fundedDate, funded_amount: Number.isFinite(fundedAmount) ? fundedAmount : 0, gross_commission: Number.isFinite(grossCommission) ? grossCommission : 0, kif_reason: p.kif_reason || null, commission_payout_date: commissionDate, fifty_percent_paid_date: fiftyDate, renewal_eligibility_date: fiftyDate };
 const { error } = await supabase.from('deals').update(updatePayload).eq('id', String(p.deal_id));
 if (error) throw new Error(error.message); revalidatePath(`/deals/${p.deal_id}`); revalidatePath('/admin/pipeline'); revalidatePath('/dashboard');
}

export async function addOffer(formData: FormData) { const supabase = await createClient(); const p = Object.fromEntries(formData); const approvalAmount = Number(p.approval_amount || 0); const factorRate = p.factor_rate ? Number(p.factor_rate) : null; const paymentAmount = p.payment_amount ? Number(p.payment_amount) : null; const totalPayback = p.total_payback ? Number(p.total_payback) : null; const termPayments = p.term_payments ? Number(p.term_payments) : null; const { error } = await supabase.from('offers').insert({ deal_id: p.deal_id, funder: p.funder, approval_amount: Number.isFinite(approvalAmount) ? approvalAmount : 0, term: p.term || null, payment_frequency: p.payment_frequency || null, factor_rate: factorRate !== null && Number.isFinite(factorRate) ? factorRate : null, payment_amount: paymentAmount !== null && Number.isFinite(paymentAmount) ? paymentAmount : null, total_payback: totalPayback !== null && Number.isFinite(totalPayback) ? totalPayback : null, term_payments: termPayments !== null && Number.isFinite(termPayments) ? termPayments : null, stipulations: p.stipulations || null, decision: p.decision || 'approval', decline_reason: p.decline_reason || null, notes: p.notes || null, status: 'open' }); if (error) throw new Error(error.message); revalidatePath(`/deals/${p.deal_id}`); }

export async function selectOffer(formData: FormData) { const supabase = await createClient(); const p = Object.fromEntries(formData); const offerId = String(p.offer_id); const dealId = String(p.deal_id); await supabase.from('offers').update({ selected_at: null }).eq('deal_id', dealId); const { error } = await supabase.from('offers').update({ selected_at: new Date().toISOString(), status: 'accepted' }).eq('id', offerId); if (error) throw new Error(error.message); await supabase.from('deals').update({ selected_offer_id: offerId }).eq('id', dealId); revalidatePath(`/deals/${dealId}`); }

export async function updateDealStage(formData: FormData) { const supabase = await createClient(); const p = Object.fromEntries(formData); const { error } = await supabase.from('deals').update({ current_stage: p.current_stage }).eq('id', String(p.deal_id)); if (error) throw new Error(error.message); revalidatePath('/admin/pipeline'); revalidatePath('/deals'); revalidatePath('/dashboard'); }
