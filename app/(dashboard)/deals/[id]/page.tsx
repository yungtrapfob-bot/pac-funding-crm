import { ProcessingFinancials } from '@/components/deals/processing-financials';
import { analysisMode } from '@/lib/document-analysis-provider';
import type { FinancialSummary } from '@/lib/document-analysis';
import { emailMode } from '@/lib/email-provider';
import { originalFilename, selectedPackageFiles } from '@/lib/funder-submissions';
import { readFunderInventory } from '@/lib/funder-inventory';
import { evaluateProcessingFunders } from '@/lib/processing-routing';
import { DealStageControls } from '@/components/deals/deal-stage-controls';
import { ApplicationDocumentReview, UploadDocumentsButton } from '@/components/deals/application-document-review';
import { SalesActions } from '@/components/sales/sales-actions';
import { SalesTimeline } from '@/components/sales/timeline';
import { FunderTracker } from '@/components/sales/funder-tracker';
import { dealStages } from '@/lib/sales-labels';
import { formatPacificDateTime } from '@/lib/pacific-time';
import type { ReactNode } from "react";
import {
  addOffer,
  addDealDocuments,
  selectOffer,
  updateDealDetails,
} from "@/actions/deals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import {
  addBusinessDays,
  calculateFiftyPercentPaidDate,
  toUiPipelineStage,
} from "@/lib/utils";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FunderSubmissionsWorkspace } from "@/components/deals/funder-submissions-workspace";
import { buildPreview } from "@/lib/funder-submissions";

function parseTermPayments(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return Math.floor(value);
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function extractRequestedAmountFromInternalNotes(value?: string | null) {
  const match = value?.match(
    /Requested funding amount:\s*\$?([\d,]+(?:\.\d+)?)/i,
  );
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DealDetailPage({
  params: pendingParams,
  searchParams: pendingSearchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; context?: string; tab?: string; offer_error?: string; upload?: string }>;
}) {
  const [params, searchParams] = await Promise.all([pendingParams, pendingSearchParams]);
  const { profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  let q = supabase
    .from("deals")
    .select("*, assigned_rep:assigned_rep_id(full_name)")
    .eq("id", params.id);
  if (profile.role === "rep")
    q = q.eq("assigned_rep_id", profile.id);

  const { data: dealRows, error: dealError } = await q.limit(1);
  if (dealError) throw new Error(dealError.message);
  const deal = dealRows?.[0] ?? null;
  if (!deal) return <p>Deal not found.</p>;
  const [{ data: queue }, { data: processors }] = await Promise.all([
    supabase.from('crm_sales_deal_queue').select('queue_stage,has_documents').eq('id',deal.id).maybeSingle(),
    isAdmin ? supabase.from('profiles').select('id,full_name').eq('is_active',true).order('full_name') : {data:[]},
  ]);
  const queueStage = queue?.queue_stage ?? 'processing';

  const { data: offers } = await supabase
    .from("offers")
    .select("*")
    .eq("deal_id", params.id)
    .order("created_at", { ascending: false });
  const funders = isAdmin ? (await readFunderInventory(supabase)).funders : [];
  const { data: files } = await supabase
    .from("deal_files")
    .select("*")
    .eq("deal_id", params.id)
    .order("created_at", { ascending: false });
  const fileRows = files ?? [];

  const { data: submissionLogs } = isAdmin
    ? await supabase
        .from("funder_submission_logs")
        .select("*")
        .eq("deal_id", params.id)
        .order("submitted_at", { ascending: false })
    : { data: [] };
  const latestSubmissionByFunder = new Map(
    (submissionLogs ?? []).map((log) => [log.funder_id, log]),
  );
  const submissionPreviews = isAdmin
    ? ((funders ?? []) as Parameters<typeof buildPreview>[1][])
        .filter((funder) => funder.is_active !== false)
        .map((funder) => buildPreview(deal, funder, files ?? [], latestSubmissionByFunder.get(funder.id)))
    : [];

  const selected =
    (offers ?? []).find(offer => offer.id === deal.selected_offer_id) ?? (offers ?? []).find(
      (o) => String(o.status ?? "").toLowerCase() === "accepted",
    ) ?? null;
  const selectedSummary = selected
    ? [
        selected.funder || null,
        selected.approval_amount
          ? `$${Number(selected.approval_amount).toLocaleString()}`
          : null,
        selected.term || null,
        selected.payment_frequency || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const hasFundedDate = Boolean(deal.funded_date);
  const calculatedCommissionPayoutDate = hasFundedDate
    ? addBusinessDays(String(deal.funded_date), 7)
    : null;
  const commissionPayoutDate =
    deal.commission_payout_date || calculatedCommissionPayoutDate;
  const commissionPayoutDisplay = formatDisplayDate(commissionPayoutDate);
  const selectedTermPayments = parseTermPayments(
    selected?.term_payments ?? selected?.term ?? null,
  );
  const calculatedFiftyPercentPaidDate = calculateFiftyPercentPaidDate({
    fundedDate: deal.funded_date,
    termPayments: selectedTermPayments,
    paymentFrequency: selected?.payment_frequency ?? null,
  });
  const fiftyPercentPaidDisplay = formatDisplayDate(
    calculatedFiftyPercentPaidDate,
  );

  const renewalDateMessage = !hasFundedDate
    ? "Cannot calculate until funded date is set."
    : !selected
      ? "Cannot calculate until an offer is selected."
      : !selectedTermPayments || !selected?.payment_frequency
        ? "Cannot calculate until selected offer includes a numeric term/payment count and payment frequency."
        : null;

  const savedMessage =
    searchParams?.saved === "workflow"
      ? "Workflow details saved successfully."
      : searchParams?.saved === "offer"
        ? "Funder response saved successfully."
        : searchParams?.saved === "selected_offer"
          ? "Offer selected successfully."
          : searchParams?.saved === "stage"
            ? "Stage updated successfully."
            : null;
  const openedFromProcessing = searchParams?.context === "processing";
  const requestedAmount = extractRequestedAmountFromInternalNotes(
    deal.internal_notes,
  );
  const [underwriting, analyses] = isAdmin ? await Promise.all([
    supabase.from('processing_underwriting').select('average_daily_balance,negative_days').eq('deal_id',deal.id).maybeSingle(),
    supabase.from('processing_document_analyses').select('id,status,summary,document_ids,version,created_at')
      .eq('deal_id',deal.id).order('created_at',{ ascending:false }).limit(10),
  ]) : [{ data: null }, { data: [] }];
  const reviewed = underwriting.data;
  const routingResults = evaluateProcessingFunders(funders, { ...deal, negative_days: reviewed?.negative_days, underwriting_reviewed: Boolean(reviewed) });
  const field = (value: string | number | null | undefined) => value == null ? '' : String(value);
  const reviewedField = (value: number | null | undefined) => !reviewed && value === 0 ? '' : field(value);
  const financeValues = {
    requested: field(deal.requested_amount ?? (!reviewed ? requestedAmount : null)),
    revenue: reviewedField(deal.monthly_revenue), balance: field(reviewed?.average_daily_balance), deposits: reviewedField(deal.deposits),
    positions: reviewedField(deal.positions), fico: field(deal.fico && deal.fico >= 300 ? deal.fico : null),
    nsfs: reviewedField(deal.nsf_count), negativeDays: field(reviewed?.negative_days), months: field(deal.time_in_business_months),
    industry: field(deal.industry), state: field(deal.state),
  };
  const workspaceClosed = Boolean(deal.archived_at) || ['lost','funded'].includes(queueStage);
  const analysisStatus = ({ needs_review:'Needs review', analyzing:'Analyzing', complete:'Analysis complete', failed:'Analysis failed' } as Record<string,string>)[analyses.data?.[0]?.status ?? ''] ?? 'Analysis pending';
  const financialPanel = isAdmin && <ProcessingFinancials key={deal.id} dealId={deal.id}
    company={deal.business_name} initial={financeValues}
    runs={(analyses.data ?? []).map(run => ({ ...run, summary: run.summary as FinancialSummary | null }))}
    mode={analysisMode()} readOnly={workspaceClosed} />;
  const submissionsPanel = isAdmin && <FunderSubmissionsWorkspace dealId={deal.id} previews={submissionPreviews} routingResults={routingResults}
    documents={selectedPackageFiles(fileRows, fileRows.map(file => file.id)).filter(file => !['application', 'statement'].includes(file.file_type ?? ''))
      .map(file => ({ id: file.id, fileType: file.file_type, filename: originalFilename(file.path) }))}
    history={(submissionLogs ?? []).map(log => ({ id: log.id, funder_id: log.funder_id, status: log.status, provider_message_id: log.provider_message_id }))}
    mode={emailMode()} readOnly={workspaceClosed} />;
  const repliesLink = <Link href={`/admin/processing/responses?deal=${deal.id}`} className="inline-block text-sm font-medium text-primary hover:underline">Review incoming funder replies</Link>;

  if (isAdmin && openedFromProcessing) {
    const activeTab = ['submissions','tracker'].includes(searchParams.tab ?? '') ? searchParams.tab : 'financials';
    const tabs = { financials: 'Financial review', submissions: 'Recommendations and packages', tracker: 'Tracker and replies' };
    const counts = { YES: 0, MAYBE: 0, NO: 0 };
    for (const result of routingResults) counts[result.fit]++;
    const displayRequest = Number(financeValues.requested);
    const ready = Boolean(queue?.has_documents) && (!deal.application_review_required || Boolean(deal.application_reviewed_at));
    return <div className="space-y-3" data-testid="processing-desk">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link className="text-primary hover:underline" href="/admin/processing">Back to processing queue</Link>
        <Link className="text-primary hover:underline" href={`/deals/${deal.id}`}>Open full deal</Link>
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{deal.business_name}</h1>
          <Badge>{dealStages[queueStage]}{deal.sales_test ? ' · Test record' : ''}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Assigned rep</dt><dd className="font-medium">{deal.assigned_rep?.full_name ?? 'Unassigned'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Requested amount</dt><dd className="font-medium">{financeValues.requested && Number.isFinite(displayRequest) ? displayRequest.toLocaleString('en-US',{ style:'currency',currency:'USD' }) : 'Unknown'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Documents</dt><dd className="font-medium">{ready ? 'Ready' : queue?.has_documents ? 'Review required' : 'Incomplete'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Analysis</dt><dd className="font-medium">{analysisStatus}</dd></div>
        </dl>
      </Card>
      <nav aria-label="Processing workspace" className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key,label]) => <Link key={key} aria-current={activeTab === key ? 'page' : undefined}
          href={`/deals/${deal.id}?context=processing&tab=${key}`}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">
          {label}{key === 'submissions' && <span className="ml-2 whitespace-nowrap text-xs">GO {counts.YES} · MAYBE {counts.MAYBE} · NO {counts.NO}</span>}
        </Link>)}
      </nav>
      {activeTab === 'financials' && <>
        <details className="rounded-lg border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Private documents · {fileRows.length}</summary>
          <ul className="mt-2 space-y-1">{fileRows.map(file => <li key={file.id}>
            <Link prefetch={false} className="text-primary hover:underline" href={`/api/deal-files/${file.id}`}>{originalFilename(file.path)}</Link>
          </li>)}</ul>
          {deal.application_review_required && !deal.application_reviewed_at && queue?.has_documents && !workspaceClosed
            && <ApplicationDocumentReview id={deal.id} admin />}
          {!fileRows.length && <p className="mt-1 text-muted-foreground">No documents uploaded.</p>}
        </details>
        {financialPanel}
      </>}
      {activeTab === 'submissions' && submissionsPanel}
      {activeTab === 'tracker' && <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Funder response tracker</h2>{repliesLink}</div>
        <FunderTracker id={deal.id} offers={offers ?? []} submissionLogs={submissionLogs ?? []} stage={dealStages[queueStage]} />
      </Card>}
    </div>;
  }


  return (
    <div className="space-y-4">
      {searchParams?.offer_error && <p role="alert" className="text-sm text-red-800">This offer is unavailable for selection. Refresh and try again.</p>}
      <div className="rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{deal.business_name}</h1>
          <Badge>{deal.archived_at ? 'Archived · ' : ''}{dealStages[queueStage]}{deal.sales_test && ' · Test record'}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Assigned Internal Rep:{" "}
          <span className="font-medium text-foreground">
            {deal.assigned_rep?.full_name ?? "Unassigned"}
          </span>
        </p>
      </div>
      {savedMessage ? (
        <div className="panel-mint p-3 text-sm">{savedMessage}</div>
      ) : null}
      {openedFromProcessing ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Opened from Processing Queue. Review docs, notes, financials, stage,
          and assigned rep before lender routing.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-xl border-border/80 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Merchant / Business Info</h2>
          <p>{deal.business_name}</p>
          <p>
            {deal.industry || "—"} · {deal.state || "—"}
          </p>
        </Card>
        <Card className="rounded-xl border-border/80 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Owner / Contact Info</h2>
          <p>{deal.owner_name}</p>
          <p>{deal.phone}</p>
          <p>{deal.email}</p>
        </Card>
        <Card className="rounded-xl border-border/80 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Financial Snapshot</h2>
          <p>
            Monthly Revenue: $
            {Number(deal.monthly_revenue || 0).toLocaleString()}
          </p>
          <p>
            Requested:{" "}
            {requestedAmount ? `$${requestedAmount.toLocaleString()}` : "—"}
          </p>
          <p>
            FICO: {deal.fico || "—"} · Positions: {deal.positions || "—"}
          </p>
          <p>
            NSF: {deal.nsf_count || 0} · Deposits/Month: {deal.deposits || 0}
          </p>
        </Card>
      </div>

      {isAdmin && !deal.archived_at && !['funded','lost'].includes(queueStage) && (
        <Card id="stage-controls">
          <h2 className="mb-2 text-lg font-medium">Stage movement</h2>
          {searchParams?.saved === 'stage_error' && <p role="alert" className="mb-2 text-sm text-red-800">Could not change the deal stage. Check its current status.</p>}
          {searchParams?.saved === 'funding_error' && <p role="alert" className="mb-2 text-sm text-red-800">Could not record funding. Check the saved funding date, amount, gross commission, and document review.</p>}
          <DealStageControls id={deal.id} stage={toUiPipelineStage(deal.current_stage)} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-medium">
          Operational Checklist / Workflow Details
        </h2>
        {isAdmin ? (
          <form
            action={updateDealDetails}
            className="grid grid-cols-1 gap-2 md:grid-cols-3"
          >
            <input type="hidden" name="deal_id" value={deal.id} />
            <Field label="Funded Date">
              <Input
                type="date"
                name="funded_date"
                readOnly={queueStage === 'funded'}
                defaultValue={deal.funded_date ?? ""}
              />
            </Field>
            <Field label="Funded Amount">
              <Input
                type="number"
                step="0.01"
                name="funded_amount"
                readOnly={queueStage === 'funded'}
                defaultValue={deal.funded_amount ?? 0}
              />
            </Field>
            <Field label="Gross Commission">
              <Input
                type="number"
                step="0.01"
                name="gross_commission"
                readOnly={queueStage === 'funded'}
                defaultValue={deal.gross_commission ?? 0}
              />
            </Field>
            {queueStage === 'funded' && <p className="text-xs text-muted-foreground md:col-span-3">Funded financial terms are protected. Notes can still be updated.</p>}
            <Field label="Internal Notes">
              <textarea
                name="internal_notes"
                defaultValue={deal.internal_notes ?? ""}
                className="min-h-20 rounded-md border p-2 text-sm md:col-span-3"
              />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                defaultValue={deal.notes ?? ""}
                className="min-h-20 rounded-md border p-2 text-sm md:col-span-3"
              />
            </Field>
            <Button type="submit" className="md:col-span-3">
              Save workflow details
            </Button>
          </form>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3 text-sm text-muted-foreground">
            Workflow detail edits, internal notes, funded amounts, and
            commission-sensitive values are admin-only.
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Offer selected: {selectedSummary || "—"}
        </p>
      </Card>

      {isAdmin && <>{financialPanel}{submissionsPanel}{repliesLink}</>}

      <Card>
        <h2 className="mb-2 text-lg font-medium">Selected Offer</h2>
        {selected ? (
          <div className="panel-mint p-3 text-sm">
            <p className="font-semibold text-emerald-950">{selected.funder}</p>
            <p className="text-emerald-900">
              Amount: ${Number(selected.approval_amount || 0).toLocaleString()}
            </p>
            <p className="text-emerald-900">Term: {selected.term || "—"}</p>
            <p className="text-emerald-900">
              Payment Frequency: {selected.payment_frequency || "—"}
            </p>
            <p className="text-emerald-900">
              Factor: {selected.factor_rate ?? "—"}
            </p>
            <p className="text-emerald-900">
              Payment Amount: $
              {Number(selected.payment_amount || 0).toLocaleString()}
            </p>
            <p className="text-emerald-900">
              Total Payback: $
              {Number(selected.total_payback || 0).toLocaleString()}
            </p>
            <p className="text-emerald-900">
              Stipulations: {selected.stipulations || "—"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No offer selected yet.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-medium">Funder Responses / Offers</h2>
        {isAdmin ? (
          <form
            action={addOffer}
            className="grid grid-cols-1 gap-2 md:grid-cols-4"
          >
            <input type="hidden" name="deal_id" value={deal.id} />
            <label className="grid gap-1 text-sm">Record response
              <select name="revise_offer_id" className="rounded border border-border p-2">
                <option value="">Add a new response</option>
                {(offers ?? []).filter(o => ['open','declined'].includes(o.status)).map(o =>
                  <option key={o.id} value={o.id}>Revise {o.funder} · {o.status}</option>)}
              </select>
            </label>
            <Input name="funder" placeholder="Funder name" required />
            <select
              name="decision"
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="approval">Approval</option>
              <option value="decline">Decline</option>
            </select>
            <Input name="decline_reason" placeholder="Decline reason" />
            <Input
              name="approval_amount"
              type="number"
              step="0.01"
              placeholder="Amount"
              required
            />
            <Input name="term" placeholder="Term text" />
            <Input
              name="term_payments"
              type="number"
              placeholder="# of payments"
            />
            <Input
              name="payment_frequency"
              placeholder="daily / weekly / biweekly / monthly"
            />
            <Input
              name="factor_rate"
              type="number"
              step="0.001"
              placeholder="Factor"
            />
            <Input
              name="payment_amount"
              type="number"
              step="0.01"
              placeholder="Payment amount"
            />
            <Input
              name="total_payback"
              type="number"
              step="0.01"
              placeholder="Total payback"
            />
            <Input name="stipulations" placeholder="Stipulations" />
            <Button type="submit">Add funder response</Button>
          </form>
        ) : (
          <div className="mb-3 rounded-md border border-dashed border-border/80 bg-muted/30 p-3 text-sm text-muted-foreground">
            Offer creation, edits, and selection are admin-only. You can still
            review available responses for your assigned deals.
          </div>
        )}
        <div className="mt-4 space-y-2">
          {offers?.map((o) => (
            <div
              key={o.id}
              className={`rounded border p-3 text-sm ${selected?.id === o.id ? "panel-mint-subtle border-emerald-300" : "bg-card text-foreground"}`}
            >
              <p className="font-medium">
                {o.funder} · {o.status}
                {selected?.id === o.id ? (
                  <span className="badge-mint-strong ml-2">Selected</span>
                ) : null}
              </p>
              <p
                className={
                  selected?.id === o.id ? "text-emerald-900" : undefined
                }
              >
                ${Number(o.approval_amount || 0).toLocaleString()} ·{" "}
                {o.term || "—"} · {o.payment_frequency || "—"}
              </p>
              <p
                className={
                  selected?.id === o.id ? "text-emerald-900" : undefined
                }
              >
                Factor {o.factor_rate ?? "—"} · Payment $
                {Number(o.payment_amount || 0).toLocaleString()}
              </p>
              <p
                className={
                  selected?.id === o.id
                    ? "text-emerald-900"
                    : "text-muted-foreground"
                }
              >
                {o.notes || o.stipulations || "—"}
              </p>
              {!["Funded", "KIF"].includes(toUiPipelineStage(deal.current_stage)) ? (
                <form action={selectOffer}>
                  <input type="hidden" name="deal_id" value={deal.id} />
                  <input type="hidden" name="offer_id" value={o.id} />
                  <Button
                    type="submit"
                    className={
                      selected?.id === o.id
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                        : undefined
                    }
                    disabled={selected?.id === o.id || !["open", "accepted"].includes(o.status)}
                  >
                    {selected?.id === o.id ? "Selected" : "Select Offer"}
                  </Button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  This deal is closed.
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card id="sales-actions">
        <h2 className="mb-2 text-lg font-medium">Next action</h2>
        {deal.sales_follow_up_at && <p className="mb-2 text-sm">{deal.sales_next_action} · {formatPacificDateTime(deal.sales_follow_up_at)} (Pacific)</p>}
        {deal.converted_from_hot_lead_id && <Link className="mb-2 block text-primary underline" href={`/hot-leads/${deal.converted_from_hot_lead_id}`}>Originating lead and activity</Link>}
        <SalesActions entity="deal" id={deal.id} admin={isAdmin} lost={queueStage === 'lost'} closed={Boolean(deal.archived_at) || queueStage === 'funded'}
          hasTask={Boolean(deal.sales_follow_up_at)} source={deal.sales_source ?? undefined} isTest={Boolean(deal.sales_test)}
          processors={(processors ?? []).map(p => ({id:p.id,name:p.full_name ?? p.id}))} />
      </Card>
      <Card><h2 className="mb-2 text-lg font-medium">Funder response tracker</h2>
        <FunderTracker id={deal.id} offers={offers ?? []} submissionLogs={submissionLogs ?? []} stage={dealStages[queueStage]} />
      </Card>
      <Card><h2 className="mb-2 text-lg font-medium">Sales history</h2><SalesTimeline entity="deal" id={deal.id} /></Card>

      <Card>
        <h2 className="mb-2 text-lg font-medium">Uploaded Files / Docs</h2>
        {searchParams?.upload === 'incomplete' && <p role="alert" className="mb-2 text-sm text-red-800">The application is incomplete. Check the list and attach any missing documents below.</p>}
        {searchParams?.upload === 'missing' && <p role="alert" className="mb-2 text-sm text-red-800">Choose a document to upload.</p>}
        {searchParams?.upload === 'complete' && <p role="status" className="mb-2 text-sm text-emerald-800">Documents uploaded.</p>}
        {deal.application_review_required && deal.application_reviewed_at && <p className="mb-2 text-sm text-emerald-800">Document review complete.</p>}
        {deal.application_review_required && !deal.application_reviewed_at && queue?.has_documents && !deal.archived_at
          && queueStage === 'missing_documents' && <ApplicationDocumentReview id={deal.id} admin={isAdmin} />}
        {!deal.archived_at && <form action={addDealDocuments} className="mb-3 grid gap-2 text-sm md:grid-cols-2">
          <input type="hidden" name="deal_id" value={deal.id} />
          <label>Signed application<Input type="file" name="application_file" /></label>
          <label>Bank statements<Input type="file" name="bank_statements" multiple /></label>
          <UploadDocumentsButton />
        </form>}

        <div className="space-y-2 text-sm">
          {fileRows.length ? (
            fileRows.map((f) => (
              <div key={f.id} className="rounded border p-3">
                <p className="font-medium">{f.file_type === 'application' ? 'Application' : f.file_type === 'statement' ? 'Statement' : f.file_type}</p>
                <p className="break-all text-muted-foreground">{f.path.split('/').at(-1)?.replace(/^[0-9a-f-]{36}-/i, '')}</p>
                <Link href={`/api/deal-files/${f.id}`} prefetch={false} className="mt-2 inline-block text-primary underline">
                  Download
                </Link>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No files uploaded yet.</p>
          )}
        </div>
      </Card>
      {isAdmin ? (
        <>
          <Card>
            <h2 className="mb-2 text-lg font-medium">Submission History</h2>
            <div className="space-y-2 text-sm">
              {(submissionLogs ?? []).length ? (submissionLogs ?? []).map((log) => (
                <div key={log.id} className="rounded border p-3">
                  <p className="font-medium">{log.funder_name} · {log.status}</p>
                  <p className="text-muted-foreground">{log.recipient} · {new Date(log.submitted_at).toLocaleString()}</p>
                  <p>{log.subject}</p>
                  <p className="text-xs text-muted-foreground">Files: {(log.filenames_attached ?? []).join(", ") || "—"}</p>
                  {log.provider_message_id ? <p className="text-xs">Provider ID: {log.provider_message_id}</p> : null}
                  {log.error_details ? <p className="text-xs text-red-700">{log.error_details}</p> : null}
                </div>
              )) : <p className="text-muted-foreground">No submissions yet.</p>}
            </div>
          </Card>

          <Card className="hidden">
            <h2 className="mb-2 text-lg font-medium">
              Processing Submission Desk (Future Funder Routing)
            </h2>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3">
                <p className="font-medium">Selected Funders</p>
                <p className="mt-1 text-muted-foreground">
                  Placeholder for chosen lender targets and routing priority.
                </p>
              </div>
              <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3">
                <p className="font-medium">Submission Method</p>
                <p className="mt-1 text-muted-foreground">
                  Placeholder for API / email / portal channel selection and
                  handoff mode.
                </p>
              </div>
              <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3">
                <p className="font-medium">Submission Log</p>
                <p className="mt-1 text-muted-foreground">
                  Placeholder for outbound attempt history, timestamps, and
                  statuses.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-lg font-medium">Payout / Renewal Info</h2>
            <p>
              Funded Amount: ${Number(deal.funded_amount || 0).toLocaleString()}
            </p>
            <p>Funded Date: {formatDisplayDate(deal.funded_date) || "—"}</p>
            <p>
              Commission Payout Date:{" "}
              {commissionPayoutDisplay ||
                "Cannot calculate until funded date is set."}
            </p>
            <p>
              50% Paid / Renewal Date:{" "}
              {fiftyPercentPaidDisplay || renewalDateMessage || "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Calculated from funded date and selected offer schedule when
              available.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
