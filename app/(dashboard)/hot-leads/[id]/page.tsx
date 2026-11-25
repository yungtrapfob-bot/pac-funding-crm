import { SalesActions } from '@/components/sales/sales-actions';
import { SalesTimeline } from '@/components/sales/timeline';
import { leadStages } from '@/lib/sales-labels';
import Link from 'next/link';
import { startHotLeadConversion, updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

import { formatPacificDateTime, pacificInputValue } from '@/lib/pacific-time';

export default async function HotLeadDetail({ params: pendingParams, searchParams: pendingSearchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; from?: string }> }) {
  const [params, searchParams] = await Promise.all([pendingParams, pendingSearchParams]);
  const { profile } = await requireUser();
  const supabase = await createClient();
  let leadQuery = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').eq('id', params.id);
  if (profile.role === 'rep') leadQuery = leadQuery.eq('assigned_rep_id', profile.id);

  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return <p>Lead not found.</p>;

  const historical = Boolean(lead.archived_at || lead.converted_at || lead.sales_review);

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

  const { data: conversionActivity } = await supabase.from('activities').select('deal_id').eq('hot_lead_id', lead.id).eq('activity_type', 'hot_lead_converted').order('created_at', { ascending: false }).limit(1).maybeSingle();

  const { data: directlyLinkedDeal } = await supabase.from('deals').select('id,current_stage').eq('converted_from_hot_lead_id', lead.id).limit(1).maybeSingle();
  let convertedDeal: { id: string; current_stage: string } | null = directlyLinkedDeal;
  if (!convertedDeal && conversionActivity?.deal_id) {
    const { data: linkedDeal } = await supabase.from('deals').select('id,current_stage').eq('id', conversionActivity.deal_id).maybeSingle();
    convertedDeal = linkedDeal;
  }

  return (
    <div className="space-y-4">
      <Link href={`/hot-leads${typeof searchParams.from === 'string' ? '?' + new URLSearchParams(searchParams.from).toString() : ''}`}
        className="inline-block text-sm text-primary hover:underline">Back to hot leads</Link>
      {searchParams?.saved === 'invalid_time' && <p role="alert" className="text-red-800">Choose a valid Pacific follow-up date and time.</p>}
      {(searchParams?.saved === 'timeline_warning' || searchParams?.created === 'timeline_warning') && <p role="alert" className="text-red-800">The lead was saved, but its timeline entry could not be added. Check the timeline before retrying the note.</p>}
      {savedMessage ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{savedMessage}</div> : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{lead.business_name}</h1>
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
              <span>{lead.owner_name}</span>
              {lead.phone && <a className="text-primary hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>}
              {lead.email && <a className="text-primary hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
            </p>
            <p className="text-sm text-muted-foreground">{lead.sales_review ? 'Conversion needs review' : lead.converted_at ? 'Converted' : lead.archived_at ? 'Archived' : lead.sales_lost ? 'Lost' : leadStages[lead.sales_stage as keyof typeof leadStages]}{lead.sales_test && ' · Test record'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {convertedDeal ? <Link href={`/deals/${convertedDeal.id}`} className="rounded-md border border-border px-3 py-2 text-sm">View Created Deal ({convertedDeal.current_stage})</Link> : historical || lead.sales_lost ? null : <form action={startHotLeadConversion}><input type="hidden" name="hot_lead_id" value={lead.id} /><Button type="submit">Convert to deal</Button></form>}
          </div>
        </div>
        {!historical && !lead.sales_lost && <details><summary className="cursor-pointer text-sm font-medium">Edit contact details</summary><form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <Input name="business_name" defaultValue={lead.business_name} />
          <Input name="owner_name" defaultValue={lead.owner_name} />
          <Input name="phone" defaultValue={lead.phone} />
          <Input name="email" defaultValue={lead.email} />
          <select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select>
          <Input type="datetime-local" name="next_follow_up_date" aria-label="Follow-up date and time (Pacific)" defaultValue={lead.next_follow_up_date ? pacificInputValue(lead.next_follow_up_date) : ''} />
          <Input name="outcome_tag" defaultValue={lead.outcome_tag ?? ''} placeholder="Outcome tag (interested, docs requested, not qualified, etc.)" className="md:col-span-2" />
          <textarea name="activity_note" placeholder="Add follow-up activity note (new timeline entry)" className="min-h-24 rounded-md border border-border bg-transparent p-3 text-sm md:col-span-2" />
          <Button type="submit" className="md:col-span-2">Save lead updates</Button>
        </form></details>}
      </Card>

      {!historical && <Card id="sales-actions"><h2 className="mb-2 text-lg font-medium">Next action</h2>
        {lead.next_follow_up_date && <p className="mb-2 text-sm">Follow-up · {formatPacificDateTime(lead.next_follow_up_date)} (Pacific)</p>}
        <SalesActions entity="lead" id={lead.id} admin={profile.role === 'admin'} lost={Boolean(lead.sales_lost)}
          hasTask={Boolean(lead.next_follow_up_date)} source={lead.sales_source ?? undefined} isTest={Boolean(lead.sales_test)} />
      </Card>}
      <Card><h2 className="mb-2 text-lg font-medium">Sales history</h2><SalesTimeline entity="lead" id={lead.id} /></Card>
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
