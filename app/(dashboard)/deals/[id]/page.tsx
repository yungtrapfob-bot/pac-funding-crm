import type { ReactNode } from 'react';
import { addOffer, selectOffer, updateDealDetails, updateDealStage } from '@/actions/deals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { PIPELINE_STAGES } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function DealDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let q = supabase.from('deals').select('*').eq('id', params.id);
  if (profile.role === 'rep') q = q.or(`assigned_rep_id.eq.${profile.id},closer_rep_id.eq.${profile.id}`);

  const { data: deal } = await q.single();
  if (!deal) return <p>Deal not found.</p>;

  const { data: offers } = await supabase.from('offers').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const { data: files } = await supabase.from('deal_files').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });
  const fileRows = await Promise.all((files ?? []).map(async (file) => {
    const { data } = await supabase.storage.from('deal-files').createSignedUrl(file.path, 60 * 60);
    return { ...file, signedUrl: data?.signedUrl ?? null };
  }));
  const selected = offers?.find((o) => o.id === deal.selected_offer_id);

  const savedMessage = searchParams?.saved === 'workflow' ? 'Workflow details saved successfully.'
    : searchParams?.saved === 'offer' ? 'Funder response saved successfully.'
      : searchParams?.saved === 'selected_offer' ? 'Offer selected successfully.'
        : searchParams?.saved === 'stage' ? 'Stage updated successfully.'
          : null;

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{deal.business_name}</h1><Badge>{deal.current_stage}</Badge></div>
    {savedMessage ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{savedMessage}</div> : null}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card><h2 className="mb-2 text-lg font-medium">Merchant / Business Info</h2><p>{deal.business_name}</p><p>{deal.industry || '—'} · {deal.state || '—'}</p></Card>
      <Card><h2 className="mb-2 text-lg font-medium">Owner / Contact Info</h2><p>{deal.owner_name}</p><p>{deal.phone}</p><p>{deal.email}</p></Card>
      <Card><h2 className="mb-2 text-lg font-medium">Financial Snapshot</h2><p>Monthly Revenue: ${Number(deal.monthly_revenue || 0).toLocaleString()}</p><p>FICO: {deal.fico || '—'} · Positions: {deal.positions || '—'}</p><p>NSF: {deal.nsf_count || 0} · Deposits/Month: {deal.deposits || 0}</p></Card>
    </div>

    <Card><h2 className="mb-2 text-lg font-medium">Stage Movement</h2><form action={updateDealStage} className="flex gap-2"><input type="hidden" name="deal_id" value={deal.id} /><select name="current_stage" defaultValue={deal.current_stage} className="rounded-md border px-3 py-2 text-sm">{PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}</select><Button type="submit">Move Stage</Button></form></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Operational Checklist / Workflow Details</h2><form action={updateDealDetails} className="grid grid-cols-1 gap-2 md:grid-cols-3"><input type="hidden" name="deal_id" value={deal.id} /><Field label="Funded Date"><Input type="date" name="funded_date" defaultValue={deal.funded_date ?? ''} /></Field><Field label="Funded Amount"><Input type="number" step="0.01" name="funded_amount" defaultValue={deal.funded_amount ?? 0} /></Field><Field label="Gross Commission"><Input type="number" step="0.01" name="gross_commission" defaultValue={deal.gross_commission ?? 0} /></Field><Field label="Internal Notes"><textarea name="internal_notes" defaultValue={deal.internal_notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Field label="Notes"><textarea name="notes" defaultValue={deal.notes ?? ''} className="min-h-20 rounded-md border p-2 text-sm md:col-span-3" /></Field><Button type="submit" className="md:col-span-3">Save workflow details</Button></form>
      <p className="mt-3 text-sm text-muted-foreground">Offer selected: {selected ? selected.funder : '—'}</p>
    </Card>


    <Card><h2 className="mb-2 text-lg font-medium">Selected Offer</h2>{selected ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm"><p className="font-semibold text-emerald-900">{selected.funder}</p><p>Amount: ${Number(selected.approval_amount || 0).toLocaleString()}</p><p>Term: {selected.term || '—'}</p><p>Payment Frequency: {selected.payment_frequency || '—'}</p><p>Factor: {selected.factor_rate ?? '—'}</p><p>Payment Amount: ${Number(selected.payment_amount || 0).toLocaleString()}</p><p>Total Payback: ${Number(selected.total_payback || 0).toLocaleString()}</p><p>Stipulations: {selected.stipulations || '—'}</p></div> : <p className="text-sm text-muted-foreground">No offer selected yet.</p>}</Card>

    <Card><h2 className="mb-2 text-lg font-medium">Funder Responses / Offers</h2><form action={addOffer} className="grid grid-cols-1 gap-2 md:grid-cols-4"><input type="hidden" name="deal_id" value={deal.id} /><Input name="funder" placeholder="Funder name" required /><select name="decision" className="rounded-md border px-3 py-2 text-sm"><option value="approval">Approval</option><option value="decline">Decline</option></select><Input name="decline_reason" placeholder="Decline reason" /><Input name="approval_amount" type="number" step="0.01" placeholder="Amount" required /><Input name="term" placeholder="Term text" /><Input name="term_payments" type="number" placeholder="# of payments" /><Input name="payment_frequency" placeholder="daily / weekly / biweekly / monthly" /><Input name="factor_rate" type="number" step="0.001" placeholder="Factor" /><Input name="payment_amount" type="number" step="0.01" placeholder="Payment amount" /><Input name="total_payback" type="number" step="0.01" placeholder="Total payback" /><Input name="stipulations" placeholder="Stipulations" /><Button type="submit">Add funder response</Button></form>
      <div className="mt-4 space-y-2">{offers?.map((o) => <div key={o.id} className={`rounded border p-3 text-sm ${deal.selected_offer_id === o.id ? 'border-emerald-400 bg-emerald-50' : ''}`}><p className="font-medium">{o.funder} · {o.status}{deal.selected_offer_id === o.id ? ' · Selected' : ''}</p><p>${Number(o.approval_amount || 0).toLocaleString()} · {o.term || '—'} · {o.payment_frequency || '—'}</p><p>Factor {o.factor_rate ?? '—'} · Payment ${Number(o.payment_amount || 0).toLocaleString()}</p><p>{o.notes || o.stipulations || '—'}</p><form action={selectOffer}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="offer_id" value={o.id} /><Button type="submit" variant={deal.selected_offer_id === o.id ? 'secondary' : 'default'} disabled={deal.selected_offer_id === o.id || o.status === 'declined'}>{deal.selected_offer_id === o.id ? 'Selected' : 'Select Offer'}</Button></form></div>)}</div>
    </Card>

    <Card><h2 className="mb-2 text-lg font-medium">Uploaded Files / Docs</h2><div className="space-y-2 text-sm">{fileRows.length ? fileRows.map((f) => <div key={f.id} className="rounded border p-3"><p className="font-medium">{f.file_type}</p><p className="break-all text-muted-foreground">{f.path}</p>{f.signedUrl ? <div className="mt-2"><Link href={f.signedUrl} target="_blank" className="text-primary underline">Open / Download</Link></div> : <p className="mt-2 text-xs text-muted-foreground">File link unavailable. Please re-open this page to refresh signed links.</p>}</div>) : <p className="text-muted-foreground">No files uploaded yet.</p>}</div></Card>

    <Card><h2 className="mb-2 text-lg font-medium">Payout / Renewal Info</h2><p>Funded Amount: ${Number(deal.funded_amount || 0).toLocaleString()}</p><p>Funded Date: {deal.funded_date || '—'}</p><p>Commission Payout Date: {deal.commission_payout_date || 'Cannot calculate until funded date is set.'}</p></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;
}
