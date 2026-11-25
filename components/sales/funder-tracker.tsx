import { createClient } from '@/lib/supabase/server';
import { formatPacificDateTime } from '@/lib/pacific-time';

type Offer = {
  id: string; funder: string; status: string; approval_amount: number; factor_rate?: number; payment_amount?: number;
  payment_frequency?: string; term?: string; stipulations?: string; decline_reason?: string; notes?: string; updated_at: string;
};
type Submission = { funder_name: string; submitted_at: string; status: string };

export async function FunderTracker({ id, offers, submissionLogs, stage }: { id: string; offers: Offer[]; submissionLogs: Submission[]; stage: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('crm_sales_events').select('funder,occurred_at').eq('deal_id',id)
    .eq('kind','submitted').not('funder','is',null).order('occurred_at');
  const responses = new Map<string,{ name: string; submitted?: string; status?: string; offers: Offer[] }>();
  const group = (name: string) => {
    const key = name.trim().toLowerCase();
    const row = responses.get(key) ?? { name, offers: [] };
    responses.set(key,row);
    return row;
  };
  const submissions = [...(data ?? []).map(row => ({funder_name:row.funder,submitted_at:row.occurred_at,status:'sent'})),...submissionLogs]
    .sort((a,b) => Date.parse(a.submitted_at)-Date.parse(b.submitted_at));
  for (const sub of submissions) {
    const row = group(sub.funder_name);
    if (sub.status === 'sent') row.submitted ??= sub.submitted_at;
    row.status = sub.status;
  }
  for (const offer of offers) group(offer.funder).offers.push(offer);
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Deal stage · {stage}</p>
    {error && <p role="alert" className="text-sm text-red-800">Submission history is temporarily unavailable.</p>}
    {!responses.size && <p className="text-sm text-muted-foreground">No funder submissions or responses recorded.</p>}
    {[...responses.values()].map(row => <details key={row.name} className="rounded border border-border p-2 text-sm" open>
      <summary className="cursor-pointer font-medium">{row.name} · {row.offers.length
        ? row.offers.some(o => o.status === 'accepted') ? 'Offer selected'
          : row.offers.some(o => o.status === 'open') ? 'Approved'
          : row.offers.every(o => o.status === 'declined') ? 'Declined' : 'Responses recorded'
        : row.submitted ? 'Awaiting response' : row.status ?? 'No response'}</summary>
      <p className="text-muted-foreground">{row.submitted ? `First submission · ${formatPacificDateTime(row.submitted)}` : 'Submission time unrecorded'}</p>
      {row.offers.map(o => <div className="border-t border-border py-1" key={o.id}>
        <p>{o.status} · {o.approval_amount > 0 ? `$${Number(o.approval_amount).toLocaleString('en-US')}` : 'Amount unrecorded'}
          {o.factor_rate ? ` · factor ${o.factor_rate}` : ''}{o.payment_amount ? ` · $${o.payment_amount} ${o.payment_frequency ?? ''}` : ''}{o.term ? ` · ${o.term}` : ''}</p>
        <p className="text-muted-foreground">{[o.decline_reason,o.stipulations,o.notes].filter(Boolean).join(' · ')}</p>
        <p className="text-xs text-muted-foreground">Last updated {formatPacificDateTime(o.updated_at)}</p>
      </div>)}
    </details>)}
  </div>;
}
