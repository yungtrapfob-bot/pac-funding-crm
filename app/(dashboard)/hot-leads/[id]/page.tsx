import Link from 'next/link';
import { startHotLeadConversion, updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DeleteHotLeadForm } from '@/components/hot-leads/delete-hot-lead-form';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function formatDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hours = get('hour');
  const minutes = get('minute');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatPacificDateTime(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export default async function HotLeadDetail({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string; created?: string; delete?: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  let leadQuery = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').eq('id', params.id);
  if (profile.role === 'rep') leadQuery = leadQuery.eq('assigned_rep_id', profile.id);

  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return <p>Lead not found.</p>;

  const { data: activityRows } = await supabase
    .from('activities')
    .select('id,created_at,activity_type,details,actor:actor_id(full_name)')
    .eq('hot_lead_id', lead.id)
    .in('activity_type', ['hot_lead_activity'])
    .order('created_at', { ascending: false });

  const savedMessage = searchParams?.saved === 'hot_lead' || searchParams?.saved === '1'
    ? 'Lead updates saved successfully.'
    : searchParams?.created === '1'
      ? 'Hot lead created successfully.'
      : null;
  const deleteMessage = searchParams?.delete === 'converted'
    ? 'Converted leads are protected from deletion. Open the created deal instead.'
    : null;

  const { data: conversionActivity } = await supabase.from('activities').select('deal_id').eq('hot_lead_id', lead.id).eq('activity_type', 'hot_lead_converted').order('created_at', { ascending: false }).limit(1).maybeSingle();

  let convertedDeal: { id: string; current_stage: string } | null = null;
  if (conversionActivity?.deal_id) {
    const { data: linkedDeal } = await supabase.from('deals').select('id,current_stage').eq('id', conversionActivity.deal_id).maybeSingle();
    convertedDeal = linkedDeal;
  }

  return (
    <div className="space-y-4">
      {savedMessage ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{savedMessage}</div> : null}
      {deleteMessage ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{deleteMessage}</div> : null}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{lead.business_name}</h1>
            <p className="text-sm text-muted-foreground">Lead workbench: follow-up, notes, callbacks, and conversion readiness.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {profile.role === 'admin' ? <DeleteHotLeadForm leadId={lead.id} businessName={lead.business_name ?? 'this lead'} /> : null}
            {convertedDeal ? <Link href={`/deals/${convertedDeal.id}`} className="rounded-md border border-border px-3 py-2 text-sm">View Created Deal ({convertedDeal.current_stage})</Link> : <form action={startHotLeadConversion}><input type="hidden" name="hot_lead_id" value={lead.id} /><Button type="submit">Convert to Deal / Send to Underwriting</Button></form>}
          </div>
        </div>

        <form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <Input name="business_name" defaultValue={lead.business_name} />
          <Input name="owner_name" defaultValue={lead.owner_name} />
          <Input name="phone" defaultValue={lead.phone} />
          <Input name="email" defaultValue={lead.email} />
          <select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select>
          <Input type="datetime-local" name="next_follow_up_date" defaultValue={formatDateTimeLocal(lead.next_follow_up_date)} />
          <Input name="outcome_tag" defaultValue={lead.outcome_tag ?? ''} placeholder="Outcome tag (interested, docs requested, not qualified, etc.)" className="md:col-span-2" />
          <textarea name="activity_note" placeholder="Add follow-up activity note (new timeline entry)" className="min-h-24 rounded-md border border-border bg-transparent p-3 text-sm md:col-span-2" />
          <Button type="submit" className="md:col-span-2">Save lead updates</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-medium">Activity Timeline</h2>
        <div className="space-y-2">
          {activityRows?.length ? activityRows.map((item) => {
            const details = (item.details ?? {}) as Record<string, string | null | undefined>;
            return <div key={item.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{((Array.isArray(item.actor) ? item.actor[0] : item.actor) as { full_name?: string } | null)?.full_name ?? 'Unknown user'} · {formatPacificDateTime(item.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{details.note ?? 'Activity update.'}</p>
              {details.scheduled_follow_up_at ? <p className="mt-1 text-xs">Follow-up scheduled for {formatPacificDateTime(details.scheduled_follow_up_at)} (Pacific)</p> : null}
            </div>;
          }) : <p className="text-sm text-muted-foreground">No timeline activity yet.</p>}
        </div>
      </Card>
    </div>
  );
}
