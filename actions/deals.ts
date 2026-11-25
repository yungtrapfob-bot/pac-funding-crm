"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth";
import { pacificInputValue, parsePacificInput } from "@/lib/pacific-time";
import { PIPELINE_STAGES } from "@/lib/utils";

const followUpStatusSchema = z.enum([
  "pending",
  "contacted",
  "scheduled",
  "stale",
]);
const dealStageSchema = z.enum(PIPELINE_STAGES);

const hotLeadSchema = z.object({
  business_name: z.string().trim().min(2).max(200),
  owner_name: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(40).refine(value => !value || value.replace(/\D/g, '').length >= 7, 'Enter a valid phone number.'),
  email: z.union([z.literal(''), z.email()]).transform(value => value.toLowerCase()),
  industry: z.string().optional().default(""),
  monthly_revenue: z.coerce.number().nonnegative().optional().default(0),
  time_in_business_months: z.coerce
    .number()
    .nonnegative()
    .optional()
    .default(0),
  state: z.string().optional().default(""),
  positions: z.coerce.number().nonnegative().optional().default(0),
  nsf_count: z.coerce.number().nonnegative().optional().default(0),
  deposits: z.coerce.number().nonnegative().optional().default(0),
  fico: z.preprocess(value => value === "" ? undefined : value, z.coerce.number().min(300).max(850).optional()),
  notes: z.string().trim().max(3000).optional(),
  next_follow_up_date: z.string().optional(),
  follow_up_status: followUpStatusSchema.default("pending"),
  outcome_tag: z.string().optional(),
}).refine(lead => lead.phone || lead.email, { path: ['phone'], message: 'Enter a phone number or email address.' });

export type HotLeadFormState = {
  status: "idle" | "error";
  message?: string;
  duplicate?: boolean;
  fieldErrors?: Record<string, string[] | undefined>;
};

async function resolveProfileIdForUser() {
  const { user, profile } = await requireUser();
  return profile.id ?? user.id;
}

function resolveHotLeadAssignedRepId(record: {
  assigned_rep_id?: string | null;
}) {
  return record.assigned_rep_id ?? null;
}

function canAccessAssignedRecord(
  role: string,
  profileId: string,
  record: { assigned_rep_id?: string | null; closer_rep_id?: string | null },
) {
  return (
    role === "admin" ||
    record.assigned_rep_id === profileId ||
    record.closer_rep_id === profileId
  );
}

function assertCanAccessAssignedRecord(
  role: string,
  profileId: string,
  record: { assigned_rep_id?: string | null; closer_rep_id?: string | null },
  label = "Record",
) {
  if (!canAccessAssignedRecord(role, profileId, record)) {
    throw new Error(`${label} not found or access denied.`);
  }
}

export async function createHotLead(
  _: HotLeadFormState,
  formData: FormData,
): Promise<HotLeadFormState> {
  const supabase = await createClient();
  const { profile } = await requireUser();
  const assignedRepId = profile.id;
  const parsed = hotLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };

  const { next_follow_up_date, notes, ...rest } = parsed.data;
  const followUpAt = next_follow_up_date ? parsePacificInput(next_follow_up_date) : null;
  if (next_follow_up_date && !followUpAt) {
    return { status: "error", message: "Choose a valid Pacific follow-up date and time.", fieldErrors: { next_follow_up_date: ["This time does not exist in Pacific time."] } };
  }
  const selectedRep = String(formData.get("assigned_rep_id") ?? "");
  let assignedTo = assignedRepId;
  if (profile.role === 'admin' && selectedRep && selectedRep !== assignedRepId) {
    if (!z.guid().safeParse(selectedRep).success) return { status: 'error', message: 'Choose an active sales rep.' };
    const { data: rep } = await supabase.from('profiles').select('id').eq('id', selectedRep).eq('role', 'rep').eq('is_active', true).maybeSingle();
    if (!rep) return { status: 'error', message: 'Choose an active sales rep.' };
    assignedTo = rep.id;
  }
  const { data: duplicate, error: duplicateError } = await supabase.rpc('crm_possible_duplicate_lead', {
    contact_phone: rest.phone, contact_email: rest.email,
  });
  if (duplicateError) return { status: 'error', message: 'Could not check for duplicate leads. Try again.' };
  if (duplicate && formData.get('confirm_duplicate') !== 'yes') {
    return { status: 'error', duplicate: true, message: 'A lead you can access has this phone number or email. Confirm if this should be a separate opportunity.' };
  }

  const nowIso = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from("hot_leads")
    .insert({
      ...rest,
      notes: notes ?? null,
      next_follow_up_date: followUpAt,
      assigned_rep_id: assignedTo,
      follow_up_status: followUpAt ? 'scheduled' : 'pending',
    })
    .select("id")
    .single();

  if (error || !lead)
    return {
      status: "error",
      message: "Could not create the lead. Check the fields and try again.",
    };

  const noteText = (notes ?? "").trim();
  const { error: timelineError } = await supabase.from("activities").insert({
    hot_lead_id: lead.id,
    actor_id: assignedRepId,
    activity_type: "hot_lead_activity",
    details: {
      category: "initial_contact",
      note: noteText || "Lead created.",
      scheduled_follow_up_at: followUpAt,
      created_from: "new_hot_lead_form",
      occurred_at: nowIso,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/hot-leads");
  redirect(`/hot-leads/${lead.id}?created=${timelineError ? "timeline_warning" : "1"}`);
}

export async function updateHotLead(formData: FormData) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const actorId = profile.id;
  const p = Object.fromEntries(formData);
  const leadId = String(p.id ?? "");
  const followUpInput = String(p.next_follow_up_date ?? "");
  const noteText = String(p.activity_note ?? "").trim();

  const { data: existingLead, error: existingLeadError } = await supabase
    .from("hot_leads")
    .select("id,assigned_rep_id,next_follow_up_date")
    .eq("id", leadId).is("archived_at", null).is("converted_at", null).eq("sales_lost", false).eq("sales_review", false)
    .maybeSingle();
  if (existingLeadError) throw new Error(existingLeadError.message);
  if (!existingLead) throw new Error("Hot lead not found or access denied.");
  assertCanAccessAssignedRecord(
    profile.role,
    profile.id,
    existingLead,
    "Hot lead",
  );

  const existingFollowUp = existingLead.next_follow_up_date;
  const followUpAt = existingFollowUp && pacificInputValue(existingFollowUp) === followUpInput
    ? existingFollowUp
    : followUpInput ? parsePacificInput(followUpInput) : null;
  if (followUpInput && !followUpAt) redirect(`/hot-leads/${leadId}?saved=invalid_time`);

  const { error } = await supabase
    .from("hot_leads")
    .update({
      business_name: p.business_name,
      owner_name: p.owner_name,
      phone: p.phone,
      email: p.email,
      follow_up_status: followUpStatusSchema.parse(p.follow_up_status),
      next_follow_up_date: followUpAt,
      outcome_tag: p.outcome_tag,
    })
    .eq("id", leadId).is("archived_at", null).is("converted_at", null).eq("sales_lost", false).eq("sales_review", false);

  if (error) throw new Error(error.message);

  if (noteText || followUpAt !== existingFollowUp) {
    const details = {
      category: "follow_up_update",
      note: noteText || "Follow-up updated.",
      scheduled_follow_up_at: followUpAt,
      follow_up_status: p.follow_up_status,
      occurred_at: new Date().toISOString(),
    };
    const { error: activityError } = await supabase.from("activities").insert({
      hot_lead_id: leadId,
      actor_id: actorId,
      activity_type: "hot_lead_activity",
      details,
    });
    if (activityError) {
      revalidatePath("/dashboard");
      revalidatePath("/hot-leads");
      redirect(`/hot-leads/${leadId}?saved=timeline_warning`);
    }
  }

  revalidatePath("/hot-leads");
  revalidatePath("/dashboard");
  revalidatePath(`/hot-leads/${leadId}`);
  redirect(`/hot-leads/${leadId}?saved=hot_lead`);
}

function parseRequestedAmount(value: FormDataEntryValue | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 && amount <= 9_999_999_999.99 ? amount : null;
}

function formatRequestedAmountForNotes(amount: number | null) {
  return amount == null ? null : `Requested funding amount: $${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function appendNoteLine(
  existing: FormDataEntryValue | string | null | undefined,
  line: string | null,
) {
  const note = String(existing ?? "").trim();
  if (!line) return note;
  return [note, line].filter(Boolean).join("\n");
}

function getFileEntries(formData: FormData) {
  const files: Array<{ file: File; type: string }> = [];
  const applicationFile = formData.get("application_file");
  if (applicationFile instanceof File && applicationFile.size > 0)
    files.push({ file: applicationFile, type: "application" });

  for (const value of formData.getAll("bank_statements")) {
    if (value instanceof File && value.size > 0)
      files.push({ file: value, type: "statement" });
  }

  return files;
}

async function uploadDealFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
  files: Array<{ file: File; type: string }>,
) {
  for (const entry of files) {
    const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const filePath = `${dealId}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("deal-files")
      .upload(filePath, entry.file, { upsert: false });
    if (uploadError) return `file upload failed: ${uploadError.message}`;

    const { error: insertFileError } = await supabase
      .from("deal_files")
      .insert({ deal_id: dealId, file_type: entry.type, path: filePath });
    if (insertFileError)
      return `file metadata save failed: ${insertFileError.message}`;
  }

  return null;
}

export type ConvertLeadFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function startHotLeadConversion(formData: FormData) {
  await requireUser();
  const leadId = z.guid().parse(formData.get("hot_lead_id"));
  redirect(`/hot-leads/${leadId}/convert`);
}

export async function submitHotLeadConversion(
  _: ConvertLeadFormState,
  formData: FormData,
): Promise<ConvertLeadFormState> {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const leadId = String(formData.get("hot_lead_id") ?? "");
  const { data: lead, error: leadError } = await supabase
    .from("hot_leads")
    .select("id,assigned_rep_id")
    .eq("id", leadId)
    .is("archived_at", null)
    .maybeSingle();
  if (leadError || !lead)
    return { status: "error", message: "Hot lead not found or inaccessible." };
  try {
    assertCanAccessAssignedRecord(profile.role, profile.id, lead, "Hot lead");
  } catch {
    return { status: "error", message: "Hot lead not found or inaccessible." };
  }

  const { data: existingDeal, error: existingDealError } = await supabase
    .from("deals").select("id").eq("converted_from_hot_lead_id", lead.id).limit(1).maybeSingle();
  if (existingDealError) return { status: "error", message: "Could not verify whether this lead already has a deal." };
  if (existingDeal) redirect(`/deals/${existingDeal.id}`);

  const { data: legacyConversion, error: legacyError } = await supabase
    .from("activities").select("deal_id").eq("hot_lead_id", lead.id)
    .eq("activity_type", "hot_lead_converted").not("deal_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (legacyError) return { status: "error", message: "Could not check conversion history." };
  if (legacyConversion?.deal_id) redirect(`/deals/${legacyConversion.deal_id}`);

  const assignedRepId = resolveHotLeadAssignedRepId(lead) ?? profile.id;
  const requestedAmount = parseRequestedAmount(formData.get("requested_amount"));
  const requestedAmountNote = formatRequestedAmountForNotes(requestedAmount);
  const files = getFileEntries(formData);
  const payload = {
    business_name: String(formData.get("business_name") ?? ""),
    owner_name: String(formData.get("owner_name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    monthly_revenue: Number(formData.get("monthly_revenue") ?? 0),
    time_in_business_months: Number(
      formData.get("time_in_business_months") ?? 0,
    ),
    state: String(formData.get("state") ?? ""),
    positions: Number(formData.get("positions") ?? 0),
    nsf_count: Number(formData.get("nsf_count") ?? 0),
    deposits: Number(formData.get("deposits") ?? 0),
    fico: Number(formData.get("fico") ?? 0),
    requested_amount: requestedAmount,
    notes: String(formData.get("notes") ?? ""),
    internal_notes: appendNoteLine(
      formData.get("internal_notes"),
      requestedAmountNote,
    ),
    assigned_rep_id: assignedRepId,
    converted_from_hot_lead_id: lead.id,
  };

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert(payload)
    .select("id")
    .single();
  if (dealError || !deal) {
    const { data: existing } = await supabase.from("deals").select("id")
      .eq("converted_from_hot_lead_id", lead.id).order("id").limit(1).maybeSingle();
    if (existing) redirect(`/deals/${existing.id}?upload=incomplete`);
    return { status: "error", message: "Could not convert this lead. Verify it is still active and assigned." };
  }

  // The deal, conversion event and lead closure commit together. Files are
  // retryable; completion is recorded only when both document types exist.
  const uploadError = await uploadDealFiles(supabase, deal.id, files);
  const incomplete = uploadError || !hasRequiredDealFiles(files);

  revalidatePath("/dashboard");
  revalidatePath("/admin/processing");
  revalidatePath("/hot-leads");
  revalidatePath("/deals");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}?${incomplete ? "upload=incomplete" : "converted=1"}`);
}

function hasRequiredDealFiles(files: ReturnType<typeof getFileEntries>) {
  return files.some((entry) => entry.type === "application") && files.some((entry) => entry.type === "statement");
}

export async function addDealDocuments(formData: FormData) {
  const { profile } = await requireUser();
  const dealId = z.guid().parse(formData.get("deal_id"));
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("id,assigned_rep_id").eq("id", dealId).maybeSingle();
  if (!deal || (profile.role !== "admin" && deal.assigned_rep_id !== profile.id)) redirect("/deals");
  const files = getFileEntries(formData);
  if (!files.length) redirect(`/deals/${dealId}?upload=missing`);
  const error = await uploadDealFiles(supabase, dealId, files);
  revalidatePath("/admin/processing");
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}?upload=${error ? "incomplete" : "complete"}`);
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient();
  const assignedRepId = await resolveProfileIdForUser();
  const files = getFileEntries(formData);
  const payload = Object.fromEntries(formData);
  const requestedAmount = parseRequestedAmount(formData.get("requested_amount"));
  const requestedAmountNote = formatRequestedAmountForNotes(requestedAmount);
  const { data: deal, error } = await supabase
    .from("deals")
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
      requested_amount: requestedAmount,
      notes: payload.notes,
      internal_notes: appendNoteLine(
        payload.internal_notes,
        requestedAmountNote,
      ),
      assigned_rep_id: assignedRepId,
    })
    .select("id")
    .single();
  if (error || !deal)
    throw new Error(error?.message ?? "Failed to create deal");

  const uploadError = await uploadDealFiles(supabase, deal.id, files);

  revalidatePath("/admin/processing");
  revalidatePath("/dashboard");
  revalidatePath("/deals");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}${uploadError || !hasRequiredDealFiles(files) ? "?upload=incomplete" : ""}`);
}

export async function updateDealDetails(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const p = Object.fromEntries(formData);
  const fundedDate = p.funded_date ? String(p.funded_date) : null;
  const fundedAmount = Number(p.funded_amount || 0);
  const grossCommission = Number(p.gross_commission || 0);
  const updatePayload = {
    notes: p.notes,
    internal_notes: p.internal_notes,
    funded_date: fundedDate,
    funded_amount: Number.isFinite(fundedAmount) ? fundedAmount : 0,
    gross_commission: Number.isFinite(grossCommission) ? grossCommission : 0,
  };
  const { error } = await supabase
    .from("deals")
    .update(updatePayload)
    .eq("id", String(p.deal_id));
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${p.deal_id}`);
  revalidatePath("/admin/pipeline");
  revalidatePath("/dashboard");
  redirect(`/deals/${p.deal_id}?saved=workflow`);
}

export async function addOffer(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const p = Object.fromEntries(formData);
  const approvalAmount = Number(p.approval_amount || 0);
  const factorRate = p.factor_rate ? Number(p.factor_rate) : null;
  const paymentAmount = p.payment_amount ? Number(p.payment_amount) : null;
  const totalPayback = p.total_payback ? Number(p.total_payback) : null;
  const termPayments = p.term_payments ? Number(p.term_payments) : null;
  const decision = String(p.decision || "approval");
  const status = decision === "decline" ? "declined" : "open";
  const declineReason = p.decline_reason
    ? `Decline reason: ${p.decline_reason}`
    : null;
  const offerPayload = {
    deal_id: p.deal_id,
    funder: p.funder,
    approval_amount: Number.isFinite(approvalAmount) ? approvalAmount : 0,
    term: p.term || null,
    term_payments:
      termPayments !== null && Number.isFinite(termPayments) && termPayments > 0
        ? Math.floor(termPayments)
        : null,
    payment_frequency: p.payment_frequency || null,
    factor_rate:
      factorRate !== null && Number.isFinite(factorRate) ? factorRate : null,
    payment_amount:
      paymentAmount !== null && Number.isFinite(paymentAmount)
        ? paymentAmount
        : null,
    total_payback:
      totalPayback !== null && Number.isFinite(totalPayback)
        ? totalPayback
        : null,
    stipulations: p.stipulations || null,
    notes: p.notes || null,
    decline_reason: declineReason,
    decision,
    status,
  };
  const revised = z.guid().safeParse(p.revise_offer_id);
  const result = revised.success
    ? await supabase.from("offers").update({ ...offerPayload, updated_at: new Date().toISOString() })
        .eq("id", revised.data).eq("deal_id", String(p.deal_id)).in("status", ["open", "declined"]).select("id").maybeSingle()
    : await supabase.from("offers").insert(offerPayload).select("id").single();
  const { error } = result;
  if (!result.data && !error) redirect(`/deals/${p.deal_id}?offer_error=1`);
  if (error) redirect(`/deals/${p.deal_id}?offer_error=1`);
  revalidatePath(`/deals/${p.deal_id}`);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/performance");
  redirect(`/deals/${p.deal_id}?saved=offer`);
}

export async function selectOffer(formData: FormData) {
  await requireUser();
  const supabase = await createClient();
  const dealId = z.guid().parse(formData.get("deal_id"));
  const offerId = z.guid().parse(formData.get("offer_id"));
  const { error } = await supabase.rpc("crm_select_offer", {
    target_deal: dealId,
    target_offer: offerId,
  });
  if (error) redirect(`/deals/${dealId}?offer_error=1`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin/pipeline");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}?saved=selected_offer`);
}

export async function updateDealStage(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const p = Object.fromEntries(formData);
  const dealId = String(p.deal_id);
  const nextStage = dealStageSchema.parse(String(p.current_stage));
  if (nextStage === 'Funded' && p.confirm_funding !== 'yes') redirect(`/deals/${dealId}?saved=funding_error#stage-controls`);
  const { error } = await supabase.rpc("crm_set_sales_deal_stage", {
    record_id: dealId, stage_label: nextStage,
  });
  if (error) redirect(`/deals/${dealId}?saved=${nextStage === 'Funded' ? 'funding_error#stage-controls' : 'stage_error#stage-controls'}`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin/pipeline");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}?saved=stage`);
}
