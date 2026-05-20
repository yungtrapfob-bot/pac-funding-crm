import Link from 'next/link';
import { startHotLeadConversion, updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function formatDateTimeLocal(value?: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 16);
}

export default async function HotLeadDetail({ params }: { params: { id: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let leadQuery = supabase
    .from('hot_leads')
    .select('*, profiles:assigned_rep_id(full_name)')
    .eq('id', params.id);
  if (profile.role === 'rep') leadQuery = leadQuery.eq('assigned_rep_id', profile.id);

  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return <p>Lead not found.</p>;

  const { data: conversionActivity } = await supabase
    .from('activities')
    .select('deal_id')
    .eq('hot_lead_id', lead.id)
    .eq('activity_type', 'hot_lead_converted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let convertedDeal: { id: string; current_stage: string } | null = null;
  if (conversionActivity?.deal_id) {
    const { data: linkedDeal } = await supabase
      .from('deals')
      .select('id,current_stage')
      .eq('id', conversionActivity.deal_id)
      .maybeSingle();
    convertedDeal = linkedDeal;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{lead.business_name}</h1>
            <p className="text-sm text-muted-foreground">Lead workbench: follow-up, notes, callbacks, and conversion readiness.</p>
          </div>
          {convertedDeal ? (
            <Link href={`/deals/${convertedDeal.id}`} className="rounded-md border border-border px-3 py-2 text-sm">
              View Created Deal ({convertedDeal.current_stage})
            </Link>
          ) : (
            <form action={startHotLeadConversion}>
              <input type="hidden" name="hot_lead_id" value={lead.id} />
              <Button type="submit">Convert to Deal / Send to Underwriting</Button>
            </form>
          )}
        </div>

        <form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <Input name="business_name" defaultValue={lead.business_name} />
          <Input name="owner_name" defaultValue={lead.owner_name} />
          <Input name="phone" defaultValue={lead.phone} />
          <Input name="email" defaultValue={lead.email} />
          <select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
            <option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option>
          </select>
          <Input type="datetime-local" name="next_follow_up_date" defaultValue={formatDateTimeLocal(lead.next_follow_up_date)} />
          <Input name="outcome_tag" defaultValue={lead.outcome_tag ?? ''} placeholder="Outcome tag (interested, docs requested, not qualified, etc.)" className="md:col-span-2" />
          <textarea name="notes" defaultValue={lead.notes ?? ''} placeholder="Call notes, objections, docs requested, callback context, and underwriting readiness." className="min-h-56 rounded-md border border-border bg-transparent p-3 text-sm md:col-span-2" />
          <Button type="submit" className="md:col-span-2">Save lead updates</Button>
        </form>
      </Card>
    </div>
  );
}
