import type { ReactNode } from 'react';
import { addOffer, selectOffer, updateDealDetails, updateDealStage } from '@/actions/deals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { PIPELINE_STAGES } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let q = supabase.from('deals').select('*').eq('id', params.id);
  if (profile.role === 'rep') q = q.eq('assigned_rep_id', profile.id);

  const { data: deal } = await q.single();
  if (!deal) return <p>Deal not found.</p>;

  const { data: offers } = await supabase.from('offers').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const { data: files } = await supabase.from('deal_files').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const selected = offers?.find((o) => o.id === deal.selected_offer_id);

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{deal.business_name}</h1><Badge>{deal.current_stage}</Badge></div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card><h2 className="mb-2 text-lg font-medium">Merchant / Business Info</h2><p>{deal.business_name}</p><p>{deal.industry || '—'} · {deal.state || '—'}</p></Card>
      <Card><h2 className="mb-2 text-lg font-medium">Owner / Contact Info</h2><p>{deal.owner_name}</p><p>{deal.phone}</p><p>{deal.email}</p></Card>
      <Card><h2 className="mb-2 text-lg font-medium">Financial Snapshot</h2><p>Monthly Revenue: ${Number(deal.monthly_revenue || 0).toLocaleString()}</p><p>FICO: {deal.fico || '—'} · Positions: {deal.positions || '—'}</p><p>NSF: {deal.nsf_count || 0} · Deposits/Month: {deal.deposits || 0}</p></Card>
    </div>

    <Card><h2 className="mb-2 text-lg font-medium">Stage Movement</h2><form action={updateDealStage} className="flex gap-2"><input type="hidden" name="deal_id" value={deal.id} /><select name="current_stage" defaultValue={deal.current_stage} className="rounded-md border px-3 py-2 text-sm">{PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}</select><Button type="submit">Move Stage</Button></form></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Operational Checklist / Workflow Details</h2><form action={updateDealDetails} className="grid grid-cols-1 gap-2 md:grid-cols-3"><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="selected_offer_payment_frequency" value={selected?.payment_frequency ?? ''} /><input type="hidden" name="selected_offer_term_payments" value={selected?.term_payments ?? ''} /><Field label="Funded Date"><Input type="date" name="funded_date" defaultValue={deal.funded_date ?? ''} /></Field><Field label="Funded Amount"><Input type="number" step="0.01" name="funded_amount" defaultValue={deal.funded_amount ?? 0} /></Field><Field label="Gross Commission"><Input type="number" step="0.01" name="gross_commission" defaultValue={deal.gross_commission ?? 0} /></Field><label><input type="checkbox" name="application_complete" defaultChecked={deal.application_complete} /> Application complete</label><label><input type="checkbox" name="docs_collected" defaultChecked={deal.docs_collected} /> Statements/docs collected</label><label><input type="checkbox" name="submission_ready" defaultChecked={deal.submission_ready} /> Submission ready</label><label><input type="checkbox" name="dl_received" defaultChecked={deal.dl_received} /> DL received</label><label><input type="checkbox" name="voided_check_received" defaultChecked={deal.voided_check_received} /> Voided check received</label><Field label="Contracts Sent Date"><Input type="date" name="contracts_sent_date" defaultValue={deal.contracts_sent_date ?? ''} /></Field><Field label="KIF Reason"><Input name="kif_reason" defaultValue={deal.kif_reason ?? ''} className="md:col-span-3" /></Field><Field label="Underwriting Notes"><textarea name="underwriting_notes" defaultValue={deal.underwriting_notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Field label="Internal Notes"><textarea name="internal_notes" defaultValue={deal.internal_notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Field label="Notes"><textarea name="notes" defaultValue={deal.notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Button type="submit" className="md:col-span-3">Save workflow details</Button></form>
      <p className="mt-3 text-sm text-muted-foreground">Commission payout: {deal.commission_payout_date ?? '—'} · 50% paid / renewal: {deal.renewal_eligibility_date ?? 'Cannot calculate until funded date + selected offer term are set.'}</p>
    </Card>

    <Card><h2 className="mb-2 text-lg font-medium">Funder Responses / Offers</h2><form action={addOffer} className="grid grid-cols-1 gap-2 md:grid-cols-4"><input type="hidden" name="deal_id" value={deal.id} /><Input name="funder" placeholder="Funder name" required /><select name="decision" className="rounded-md border px-3 py-2 text-sm"><option value="approval">Approval</option><option value="decline">Decline</option></select><Input name="decline_reason" placeholder="Decline reason" /><Input name="approval_amount" type="number" step="0.01" placeholder="Amount" required /><Input name="term" placeholder="Term text" /><Input name="term_payments" type="number" placeholder="# of payments" /><Input name="payment_frequency" placeholder="daily / weekly / biweekly / monthly" /><Input name="factor_rate" type="number" step="0.001" placeholder="Factor" /><Input name="payment_amount" type="number" step="0.01" placeholder="Payment amount" /><Input name="total_payback" type="number" step="0.01" placeholder="Total payback" /><Input name="stipulations" placeholder="Stipulations" /><Button type="submit">Add funder response</Button></form>
      <div className="mt-4 space-y-2">{offers?.map((o) => <div key={o.id} className="rounded border p-3 text-sm"><p className="font-medium">{o.funder} · {o.decision}{o.selected_at ? ' · Selected' : ''}</p><p>${Number(o.approval_amount || 0).toLocaleString()} · {o.term || '—'} · {o.payment_frequency || '—'} · {o.term_payments || 0} payments</p><p>Factor {o.factor_rate ?? '—'} · Payment ${Number(o.payment_amount || 0).toLocaleString()} · Total payback ${Number(o.total_payback || 0).toLocaleString()}</p><p>{o.decline_reason || o.stipulations || '—'}</p><form action={selectOffer}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="offer_id" value={o.id} /><Button type="submit">Select Offer</Button></form></div>)}</div>
    </Card>

    <Card><h2 className="mb-2 text-lg font-medium">Uploaded Files / Docs</h2><div className="space-y-2 text-sm">{files?.length ? files.map((f) => <p key={f.id}>{f.file_type}: {f.path}</p>) : <p className="text-muted-foreground">No files uploaded yet.</p>}</div></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Payout / Renewal Info</h2><p>Funded Amount: ${Number(deal.funded_amount || 0).toLocaleString()}</p><p>Funded Date: {deal.funded_date || '—'}</p><p>Commission Payout Date: {deal.commission_payout_date || 'Cannot calculate until funded date is set.'}</p><p>50% Paid / Renewal Eligibility Date: {deal.renewal_eligibility_date || 'Cannot calculate until funded date and selected offer schedule are set.'}</p></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;
}
