import { addOffer, updateDealStage } from '@/actions/deals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { PIPELINE_STAGES } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const { profile } = await requireUser();
  const supabase = createClient();

  const dealQuery = supabase.from('deals').select('*').eq('id', params.id);
  if (profile.role === 'rep') dealQuery.eq('assigned_rep_id', profile.id);
  const { data: deal } = await dealQuery.single();
  const { data: offers } = await supabase.from('offers').select('*').eq('deal_id', params.id).order('created_at', { ascending: false });

  if (!deal) return <p>Deal not found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{deal.business_name}</h1>
        <Badge>{deal.current_stage}</Badge>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Update Stage</h2>
        <form action={updateDealStage} className="flex items-center gap-2">
          <input type="hidden" name="deal_id" value={deal.id} />
          <select name="current_stage" className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
            {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Offers</h2>
        <form action={addOffer} className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input type="hidden" name="deal_id" value={deal.id} />
          <Input name="funder" placeholder="Funder" required />
          <Input name="approval_amount" placeholder="Approval Amount" required />
          <Input name="term" placeholder="Term" required />
          <Input name="payment_frequency" placeholder="Payment Frequency" required />
          <Input name="factor_rate" placeholder="Factor" required />
          <Input name="payment_amount" placeholder="Payment Amount" required />
          <Input name="stipulations" placeholder="Stipulations" />
          <Input name="expiration_date" type="date" />
          <Input name="notes" placeholder="Notes" />
          <select name="status" className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
            <option value="open">open</option><option value="accepted">accepted</option><option value="declined">declined</option><option value="expired">expired</option>
          </select>
          <Button type="submit">Add Offer</Button>
        </form>

        <div className="mt-4 space-y-2">
          {!offers?.length ? <p className="text-sm">No offers yet.</p> : offers.map((offer) => (
            <div key={offer.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{offer.funder} · ${Number(offer.approval_amount).toLocaleString()}</p>
              <p>Status: {offer.status}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
