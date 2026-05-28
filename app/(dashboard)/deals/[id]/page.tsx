import type { ReactNode } from 'react';
import { addOffer, selectOffer, updateDealDetails, updateDealStage } from '@/actions/deals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { addBusinessDays, calculateFiftyPercentPaidDate, PIPELINE_STAGES, toUiPipelineStage } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { evaluateFunders, type FunderMasterRecord } from '@/lib/funder-routing';
import { DealRoutingPanel } from '@/components/deals/deal-routing-panel';



function parseTermPayments(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function DealDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string; context?: string } }) {
  const { profile } = await requireUser();
  const isAdmin = profile.role === 'admin';
  const supabase = await createClient();
  let q = supabase.from('deals').select('*, assigned_rep:assigned_rep_id(full_name)').eq('id', params.id);
  if (profile.role === 'rep') q = q.or(`assigned_rep_id.eq.${profile.id},closer_rep_id.eq.${profile.id}`);

  const { data: dealRows, error: dealError } = await q.limit(1);
  if (dealError) throw new Error(dealError.message);
  const deal = dealRows?.[0] ?? null;
  if (!deal) return <p>Deal not found.</p>;

  const { data: offers } = await supabase.from('offers').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const { data: funders } = await supabase.from('funder_master').select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,required_docs,industry_yes,industry_maybe,industry_no,notes,submission_method,submission_endpoint,matrix_row').order('funder_name');
  const { data: files } = await supabase.from('deal_files').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const fileRows = await Promise.all((files ?? []).map(async (file) => {
    const { data } = await supabase.storage.from('deal-files').createSignedUrl(file.path, 60 * 60);
    return { ...file, signedUrl: data?.signedUrl ?? null };
  }));
  const selected = (offers ?? []).find((o) => String(o.status ?? '').toLowerCase() === 'accepted') ?? null;
  const selectedSummary = selected
    ? [
      selected.funder || null,
      selected.approval_amount ? `$${Number(selected.approval_amount).toLocaleString()}` : null,
      selected.term || null,
      selected.payment_frequency || null
    ].filter(Boolean).join(' · ')
    : null;


  const hasFundedDate = Boolean(deal.funded_date);
  const calculatedCommissionPayoutDate = hasFundedDate ? addBusinessDays(String(deal.funded_date), 7) : null;
  const commissionPayoutDate = deal.commission_payout_date || calculatedCommissionPayoutDate;
  const commissionPayoutDisplay = formatDisplayDate(commissionPayoutDate);
  const selectedTermPayments = parseTermPayments(selected?.term_payments ?? selected?.term ?? null);
  const calculatedFiftyPercentPaidDate = calculateFiftyPercentPaidDate({
    fundedDate: deal.funded_date,
    termPayments: selectedTermPayments,
    paymentFrequency: selected?.payment_frequency ?? null
  });
  const fiftyPercentPaidDisplay = formatDisplayDate(calculatedFiftyPercentPaidDate);

  const renewalDateMessage = !hasFundedDate
    ? 'Cannot calculate until funded date is set.'
    : !selected
      ? 'Cannot calculate until an offer is selected.'
      : !selectedTermPayments || !selected?.payment_frequency
        ? 'Cannot calculate until selected offer includes a numeric term/payment count and payment frequency.'
        : null;

  const savedMessage = searchParams?.saved === 'workflow' ? 'Workflow details saved successfully.'
    : searchParams?.saved === 'offer' ? 'Funder response saved successfully.'
      : searchParams?.saved === 'selected_offer' ? 'Offer selected successfully.'
        : searchParams?.saved === 'stage' ? 'Stage updated successfully.'
        : null;
  const openedFromProcessing = searchParams?.context === 'processing';
  const routingResults = evaluateFunders((funders ?? []) as FunderMasterRecord[], {
    monthlyRevenue: deal.monthly_revenue ?? null,
    timeInBusinessMonths: deal.time_in_business_months ?? null,
    fico: deal.fico ?? null,
    positions: deal.positions ?? null,
    nsfCount: deal.nsf_count ?? null,
    depositsPerMonth: deal.deposits ?? null,
    state: deal.state ?? null,
    industry: deal.industry ?? null,
    requestedAmount: deal.funded_amount ?? null
  });

  return <div className="space-y-4">
    <div className="rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{deal.business_name}</h1><Badge>{deal.current_stage}</Badge></div>
      <p className="mt-2 text-sm text-muted-foreground">Assigned Internal Rep: <span className="font-medium text-foreground">{deal.assigned_rep?.full_name ?? 'Unassigned'}</span></p>
    </div>
    {savedMessage ? <div className="panel-mint p-3 text-sm">{savedMessage}</div> : null}
    {openedFromProcessing ? <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Opened from Processing Queue. Review docs, notes, financials, stage, and assigned rep before lender routing.</div> : null}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-xl border-border/80 shadow-sm"><h2 className="mb-2 text-lg font-medium">Merchant / Business Info</h2><p>{deal.business_name}</p><p>{deal.industry || '—'} · {deal.state || '—'}</p></Card>
      <Card className="rounded-xl border-border/80 shadow-sm"><h2 className="mb-2 text-lg font-medium">Owner / Contact Info</h2><p>{deal.owner_name}</p><p>{deal.phone}</p><p>{deal.email}</p></Card>
      <Card className="rounded-xl border-border/80 shadow-sm"><h2 className="mb-2 text-lg font-medium">Financial Snapshot</h2><p>Monthly Revenue: ${Number(deal.monthly_revenue || 0).toLocaleString()}</p><p>FICO: {deal.fico || '—'} · Positions: {deal.positions || '—'}</p><p>NSF: {deal.nsf_count || 0} · Deposits/Month: {deal.deposits || 0}</p></Card>
    </div>

    <Card><h2 className="mb-2 text-lg font-medium">Stage Movement</h2><form action={updateDealStage} className="flex gap-2"><input type="hidden" name="deal_id" value={deal.id} /><select name="current_stage" defaultValue={toUiPipelineStage(deal.current_stage)} className="rounded-md border px-3 py-2 text-sm">{PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select><Button type="submit">Move Stage</Button></form></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Operational Checklist / Workflow Details</h2>{isAdmin ? <form action={updateDealDetails} className="grid grid-cols-1 gap-2 md:grid-cols-3"><input type="hidden" name="deal_id" value={deal.id} /><Field label="Funded Date"><Input type="date" name="funded_date" defaultValue={deal.funded_date ?? ''} /></Field><Field label="Funded Amount"><Input type="number" step="0.01" name="funded_amount" defaultValue={deal.funded_amount ?? 0} /></Field><Field label="Gross Commission"><Input type="number" step="0.01" name="gross_commission" defaultValue={deal.gross_commission ?? 0} /></Field><Field label="Internal Notes"><textarea name="internal_notes" defaultValue={deal.internal_notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Field label="Notes"><textarea name="notes" defaultValue={deal.notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Button type="submit" className="md:col-span-3">Save workflow details</Button></form> : <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3 text-sm text-muted-foreground">Workflow detail edits are admin-only. Values are shown read-only for reps.</div>}
      <p className="mt-3 text-sm text-muted-foreground">Offer selected: {selectedSummary || '—'}</p>
    </Card>


    <DealRoutingPanel results={routingResults} />

    <Card><h2 className="mb-2 text-lg font-medium">Selected Offer</h2>{selected ? <div className="panel-mint p-3 text-sm"><p className="font-semibold text-emerald-950">{selected.funder}</p><p className="text-emerald-900">Amount: ${Number(selected.approval_amount || 0).toLocaleString()}</p><p className="text-emerald-900">Term: {selected.term || '—'}</p><p className="text-emerald-900">Payment Frequency: {selected.payment_frequency || '—'}</p><p className="text-emerald-900">Factor: {selected.factor_rate ?? '—'}</p><p className="text-emerald-900">Payment Amount: ${Number(selected.payment_amount || 0).toLocaleString()}</p><p className="text-emerald-900">Total Payback: ${Number(selected.total_payback || 0).toLocaleString()}</p><p className="text-emerald-900">Stipulations: {selected.stipulations || '—'}</p></div> : <p className="text-sm text-muted-foreground">No offer selected yet.</p>}</Card>

    <Card><h2 className="mb-2 text-lg font-medium">Funder Responses / Offers</h2>{isAdmin ? <form action={addOffer} className="grid grid-cols-1 gap-2 md:grid-cols-4"><input type="hidden" name="deal_id" value={deal.id} /><Input name="funder" placeholder="Funder name" required /><select name="decision" className="rounded-md border px-3 py-2 text-sm"><option value="approval">Approval</option><option value="decline">Decline</option></select><Input name="decline_reason" placeholder="Decline reason" /><Input name="approval_amount" type="number" step="0.01" placeholder="Amount" required /><Input name="term" placeholder="Term text" /><Input name="term_payments" type="number" placeholder="# of payments" /><Input name="payment_frequency" placeholder="daily / weekly / biweekly / monthly" /><Input name="factor_rate" type="number" step="0.001" placeholder="Factor" /><Input name="payment_amount" type="number" step="0.01" placeholder="Payment amount" /><Input name="total_payback" type="number" step="0.01" placeholder="Total payback" /><Input name="stipulations" placeholder="Stipulations" /><Button type="submit">Add funder response</Button></form> : <div className="mb-3 rounded-md border border-dashed border-border/80 bg-muted/30 p-3 text-sm text-muted-foreground">Offer creation and edits are admin-only. You can still review all responses and select an offer.</div>}
      <div className="mt-4 space-y-2">{offers?.map((o) => <div key={o.id} className={`rounded border p-3 text-sm ${selected?.id === o.id ? 'panel-mint-subtle border-emerald-300' : 'bg-card text-foreground'}`}><p className="font-medium">{o.funder} · {o.status}{selected?.id === o.id ? <span className="badge-mint-strong ml-2">Selected</span> : null}</p><p className={selected?.id === o.id ? 'text-emerald-900' : undefined}>${Number(o.approval_amount || 0).toLocaleString()} · {o.term || '—'} · {o.payment_frequency || '—'}</p><p className={selected?.id === o.id ? 'text-emerald-900' : undefined}>Factor {o.factor_rate ?? '—'} · Payment ${Number(o.payment_amount || 0).toLocaleString()}</p><p className={selected?.id === o.id ? 'text-emerald-900' : 'text-muted-foreground'}>{o.notes || o.stipulations || '—'}</p><form action={selectOffer}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="offer_id" value={o.id} /><Button type="submit" className={selected?.id === o.id ? 'bg-secondary text-secondary-foreground hover:opacity-100' : undefined} disabled={selected?.id === o.id || o.status === 'declined'}>{selected?.id === o.id ? 'Selected' : 'Select Offer'}</Button></form></div>)}</div>
    </Card>

    <Card><h2 className="mb-2 text-lg font-medium">Uploaded Files / Docs</h2><div className="space-y-2 text-sm">{fileRows.length ? fileRows.map((f) => <div key={f.id} className="rounded border p-3"><p className="font-medium">{f.file_type}</p><p className="break-all text-muted-foreground">{f.path}</p>{f.signedUrl ? <div className="mt-2"><Link href={f.signedUrl} target="_blank" className="text-primary underline">Open / Download</Link></div> : <p className="mt-2 text-xs text-muted-foreground">File link unavailable. Please re-open this page to refresh signed links.</p>}</div>) : <p className="text-muted-foreground">No files uploaded yet.</p>}</div></Card>
    <Card><h2 className="mb-2 text-lg font-medium">Processing Submission Desk (Future Funder Routing)</h2><div className="grid gap-3 text-sm md:grid-cols-3"><div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3"><p className="font-medium">Selected Funders</p><p className="mt-1 text-muted-foreground">Placeholder for chosen lender targets and routing priority.</p></div><div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3"><p className="font-medium">Submission Method</p><p className="mt-1 text-muted-foreground">Placeholder for API / email / portal channel selection and handoff mode.</p></div><div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-3"><p className="font-medium">Submission Log</p><p className="mt-1 text-muted-foreground">Placeholder for outbound attempt history, timestamps, and statuses.</p></div></div></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Payout / Renewal Info</h2><p>Funded Amount: ${Number(deal.funded_amount || 0).toLocaleString()}</p><p>Funded Date: {formatDisplayDate(deal.funded_date) || '—'}</p><p>Commission Payout Date: {commissionPayoutDisplay || 'Cannot calculate until funded date is set.'}</p><p>50% Paid / Renewal Date: {fiftyPercentPaidDisplay || renewalDateMessage || '—'}</p><p className="mt-2 text-xs text-muted-foreground">Calculated from funded date and selected offer schedule when available.</p></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;
}
