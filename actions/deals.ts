"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import { PIPELINE_STAGES, toDbPipelineStage } from "@/lib/utils";

const followUpStatusSchema = z.enum([
  "pending",
  "contacted",
  "scheduled",
  "stale",
]);
const dealStageSchema = z.enum(PIPELINE_STAGES);

const hotLeadSchema = z.object({
  business_name: z.string().min(2),
  owner_name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email(),
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
  fico: z.coerce.number().min(300).max(850).optional().default(300),
  notes: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  follow_up_status: followUpStatusSchema.default("pending"),
  outcome_tag: z.string().optional(),
});

export type HotLeadFormState = {
  status: "idle" | "error";
  message?: string;
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

function parseLocalDateTime(value?: string | null) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((v) => Number.isNaN(v)))
    return null;
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

export async function createHotLead(
  _: HotLeadFormState,
  formData: FormData,
): Promise<HotLeadFormState> {
  const supabase = await createClient();
  const assignedRepId = await resolveProfileIdForUser();
  const parsed = hotLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };

  const { next_follow_up_date, notes, ...rest } = parsed.data;
  const followUpAt = parseLocalDateTime(next_follow_up_date);
  const nowIso = new Date().toISOString();

  const { data: lead, error } = await supabase
    .from("hot_leads")
    .insert({
      ...rest,
      notes: notes ?? null,
      next_follow_up_date: followUpAt,
      assigned_rep_id: assignedRepId,
      last_contact_date: nowIso.slice(0, 10),
    })
    .select("id")
    .single();

  if (error || !lead)
    return {
      status: "error",
      message: error?.message ?? "Failed to create lead.",
    };

  const noteText = (notes ?? "").trim();
  await supabase.from("activities").insert({
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
  redirect(`/hot-leads/${lead.id}?created=1`);
}

export async function updateHotLead(formData: FormData) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const actorId = profile.id;
  const p = Object.fromEntries(formData);
  const leadId = String(p.id ?? "");
  const followUpAt = parseLocalDateTime(String(p.next_follow_up_date ?? ""));
  const noteText = String(p.activity_note ?? "").trim();

  const { data: existingLead, error: existingLeadError } = await supabase
    .from("hot_leads")
    .select("id,assigned_rep_id")
    .eq("id", leadId)
    .maybeSingle();
  if (existingLeadError) throw new Error(existingLeadError.message);
  if (!existingLead) throw new Error("Hot lead not found or access denied.");
  assertCanAccessAssignedRecord(
    profile.role,
    profile.id,
    existingLead,
    "Hot lead",
  );

  const ownerId = resolveHotLeadAssignedRepId(existingLead) ?? actorId;

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
      last_contact_date: new Date().toISOString().slice(0, 10),
      assigned_rep_id: ownerId,
    })
    .eq("id", leadId);

  if (error) throw new Error(error.message);

  if (noteText || followUpAt) {
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
    if (activityError) throw new Error(activityError.message);
  }

  revalidatePath("/hot-leads");
  revalidatePath("/dashboard");
  revalidatePath(`/hot-leads/${leadId}`);
  redirect(`/hot-leads/${leadId}?saved=hot_lead`);
}

function formatRequestedAmountForNotes(
  value: FormDataEntryValue | number | null | undefined,
) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `Requested funding amount: $${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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
  for (const [index, entry] of files.entries()) {
    const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const filePath = `${dealId}/${Date.now()}-${index}-${safeName}`;
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

export async function convertHotLeadToDeal(formData: FormData) {
  const { user, profile } = await requireUser();
  const supabase = await createClient();
  const leadId = String(formData.get("hot_lead_id"));
  const { data: lead, error } = await supabase
    .from("hot_leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (error || !lead) throw new Error("Lead not found or access denied.");
  assertCanAccessAssignedRecord(profile.role, profile.id, lead, "Hot lead");

  const { data: existingDeal } = await supabase
    .from("activities")
    .select("deal_id")
    .eq("hot_lead_id", lead.id)
    .eq("activity_type", "hot_lead_converted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingDeal?.deal_id) redirect(`/deals/${existingDeal.deal_id}`);

  const ownerId = resolveHotLeadAssignedRepId(lead) ?? profile.id;
  const requestedAmountNote = formatRequestedAmountForNotes(
    lead.requested_amount,
  );
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      business_name: lead.business_name,
      owner_name: lead.owner_name,
      phone: lead.phone,
      email: lead.email,
      industry: lead.industry,
      monthly_revenue: lead.monthly_revenue,
      time_in_business_months: lead.time_in_business_months,
      state: lead.state,
      positions: lead.positions,
      nsf_count: lead.nsf_count,
      deposits: lead.deposits,
      fico: lead.fico,
      notes: lead.notes,
      internal_notes: requestedAmountNote,
      assigned_rep_id: ownerId,
    })
    .select("id")
    .single();
  if (dealErr || !deal)
    throw new Error(dealErr?.message ?? "Failed to convert lead");

  await supabase.from("activities").insert({
    hot_lead_id: lead.id,
    deal_id: deal.id,
    actor_id: user.id,
    activity_type: "hot_lead_converted",
    details: {
      source: "quick_convert",
      requested_amount: lead.requested_amount ?? null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/hot-leads");
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export type ConvertLeadFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function startHotLeadConversion(formData: FormData) {
  const leadId = String(formData.get("hot_lead_id") ?? "");
  redirect(`/hot-leads/${leadId}/convert`);
}

export async function submitHotLeadConversion(
  _: ConvertLeadFormState,
  formData: FormData,
): Promise<ConvertLeadFormState> {
  const { user, profile } = await requireUser();
  const supabase = await createClient();

  const leadId = String(formData.get("hot_lead_id") ?? "");
  const { data: lead, error: leadError } = await supabase
    .from("hot_leads")
    .select("id,assigned_rep_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError || !lead)
    return { status: "error", message: "Hot lead not found or inaccessible." };
  try {
    assertCanAccessAssignedRecord(profile.role, profile.id, lead, "Hot lead");
  } catch {
    return { status: "error", message: "Hot lead not found or inaccessible." };
  }

  const { data: existingDeal } = await supabase
    .from("activities")
    .select("deal_id")
    .eq("hot_lead_id", lead.id)
    .eq("activity_type", "hot_lead_converted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingDeal?.deal_id) redirect(`/deals/${existingDeal.deal_id}`);

  const assignedRepId = resolveHotLeadAssignedRepId(lead) ?? profile.id;
  const requestedAmount = Number(formData.get("requested_amount") ?? 0);
  const requestedAmountNote = formatRequestedAmountForNotes(requestedAmount);
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
    notes: String(formData.get("notes") ?? ""),
    internal_notes: appendNoteLine(
      formData.get("internal_notes"),
      requestedAmountNote,
    ),
    assigned_rep_id: assignedRepId,
  };

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert(payload)
    .select("id")
    .single();
  if (dealError || !deal)
    return {
      status: "error",
      message: dealError?.message ?? "Unable to create deal from intake.",
    };

  const { error: activityError } = await supabase.from("activities").insert({
    hot_lead_id: lead.id,
    deal_id: deal.id,
    actor_id: user.id,
    activity_type: "hot_lead_converted",
    details: {
      source: "underwriting_intake",
      requested_amount: Number.isFinite(requestedAmount)
        ? requestedAmount
        : null,
    },
  });
  if (activityError)
    return {
      status: "error",
      message: `Deal created, but conversion link could not be recorded: ${activityError.message}`,
    };

  const uploadError = await uploadDealFiles(
    supabase,
    deal.id,
    getFileEntries(formData),
  );
  if (uploadError)
    return { status: "error", message: `Deal created, but ${uploadError}` };

  revalidatePath("/dashboard");
  revalidatePath("/hot-leads");
  revalidatePath("/deals");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}?converted=1`);
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient();
  const assignedRepId = await resolveProfileIdForUser();
  const payload = Object.fromEntries(formData);
  const requestedAmountNote = formatRequestedAmountForNotes(
    payload.requested_amount,
  );
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

  const uploadError = await uploadDealFiles(
    supabase,
    deal.id,
    getFileEntries(formData),
  );
  if (uploadError) throw new Error(`Deal created, but ${uploadError}`);

  revalidatePath("/deals");
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/deals/${deal.id}`);
}

export async function deleteHotLead(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const leadId = String(formData.get("hot_lead_id") ?? "");
  if (!leadId) redirect("/hot-leads?delete=missing");

  const { data: lead, error: leadError } = await supabase
    .from("hot_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) redirect("/hot-leads?delete=missing");

  const { data: conversionActivity, error: conversionError } = await supabase
    .from("activities")
    .select("deal_id")
    .eq("hot_lead_id", leadId)
    .eq("activity_type", "hot_lead_converted")
    .not("deal_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (conversionError) throw new Error(conversionError.message);

  if (conversionActivity?.deal_id)
    redirect(`/hot-leads/${leadId}?delete=converted`);

  const { error: activityDeleteError } = await supabase
    .from("activities")
    .delete()
    .eq("hot_lead_id", leadId);
  if (activityDeleteError) throw new Error(activityDeleteError.message);

  const { data: deletedRows, error } = await supabase
    .from("hot_leads")
    .delete()
    .eq("id", leadId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!deletedRows?.length) throw new Error("Hot lead delete did not remove a row.");

  revalidatePath("/hot-leads");
  revalidatePath("/dashboard");
  redirect("/hot-leads?deleted=1");
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
    notes: declineReason ?? (p.notes || null),
    status,
  };
  const { error } = await supabase.from("offers").insert(offerPayload);
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${p.deal_id}`);
  redirect(`/deals/${p.deal_id}?saved=offer`);
}

export async function selectOffer(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const p = Object.fromEntries(formData);
  const offerId = String(p.offer_id);
  const dealId = String(p.deal_id);
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id,deal_id,status")
    .eq("id", offerId)
    .eq("deal_id", dealId)
    .maybeSingle();
  if (offerError) throw new Error(offerError.message);
  if (!offer) throw new Error("Offer not found for this deal");
  if (offer.status === "declined")
    throw new Error("Declined offers cannot be selected");
  const { error: resetError } = await adminSupabase
    .from("offers")
    .update({ status: "open" })
    .eq("deal_id", dealId)
    .eq("status", "accepted")
    .neq("id", offerId);
  if (resetError) throw new Error(resetError.message);
  const { data: updatedOfferRows, error: offerUpdateError } =
    await adminSupabase
      .from("offers")
      .update({ status: "accepted" })
      .eq("id", offerId)
      .eq("deal_id", dealId)
      .neq("status", "declined")
      .select("id,status");
  if (offerUpdateError) throw new Error(offerUpdateError.message);
  if (!updatedOfferRows || updatedOfferRows.length !== 1) {
    throw new Error("Selected offer update did not persist (no rows updated)");
  }
  const persistedOffer = updatedOfferRows[0];
  if (String(persistedOffer.status ?? "").toLowerCase() !== "accepted") {
    throw new Error("Selected offer status did not persist as accepted");
  }
  const { error: dealError } = await supabase
    .from("deals")
    .update({ current_stage: toDbPipelineStage("Contracts Out") })
    .eq("id", dealId);
  if (dealError) throw new Error(dealError.message);
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
  const { error } = await supabase
    .from("deals")
    .update({ current_stage: toDbPipelineStage(nextStage) })
    .eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin/pipeline");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}?saved=stage`);
}
