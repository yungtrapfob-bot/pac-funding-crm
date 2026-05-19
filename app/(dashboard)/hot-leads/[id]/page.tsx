import { updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function formatDateTimeLocal(value?: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 16);
}

export default async function HotLeadDetail({ params, searchParams }: { params: { id: string }; searchParams: { created?: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const leadQuery = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').eq('id', params.id);
  if (profile.role === 'rep') leadQuery.eq('assigned_rep_id', profile.id);
  const { data: lead } = await leadQuery.single();
  if (!lead) return <p>Lead not found.</p>;

  return <div className="space-y-4"><Card>{searchParams.created === '1' ? <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Lead saved successfully. Continue follow-up updates below.</p> : null}
  <h1 className="mb-1 text-xl font-semibold">{lead.business_name}</h1><p className="mb-3 text-sm text-muted-foreground">Assigned rep: {lead.profiles?.full_name ?? '—'}</p>
  <form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2"><input type="hidden" name="id" value={lead.id}/><Input name="business_name" defaultValue={lead.business_name}/><Input name="owner_name" defaultValue={lead.owner_name}/><Input name="phone" defaultValue={lead.phone}/><Input name="email" defaultValue={lead.email}/><select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select><Input type="datetime-local" name="next_follow_up_date" defaultValue={formatDateTimeLocal(lead.next_follow_up_date)}/><Input name="outcome_tag" defaultValue={lead.outcome_tag ?? ''} placeholder="Outcome tag"/><Input name="industry" defaultValue={lead.industry ?? ''} placeholder="Industry"/>
  <textarea name="notes" defaultValue={lead.notes ?? ''} className="min-h-32 rounded-md border border-border bg-transparent p-2 text-sm md:col-span-2"/>
  <Button type="submit" className="md:col-span-2">Save lead updates</Button></form></Card></div>;
}
