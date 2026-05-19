import { convertHotLeadToDeal, updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function formatDateTimeLocal(value?: string | null) { if (!value) return ''; return new Date(value).toISOString().slice(0, 16); }

export default async function HotLeadDetail({ params }: { params: { id: string } }) {
  const { profile } = await requireUser(); const supabase = await createClient();
  let q = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').eq('id', params.id);
  if (profile.role === 'rep') q = q.eq('assigned_rep_id', profile.id); const { data: lead } = await q.single(); if (!lead) return <p>Lead not found.</p>;
  return <div className="space-y-4"><Card><div className="mb-3 flex items-center justify-between"><div><h1 className="text-xl font-semibold">{lead.business_name}</h1><p className="text-sm text-muted-foreground">Hot lead task tracking</p></div><form action={convertHotLeadToDeal}><input type="hidden" name="hot_lead_id" value={lead.id}/><Button type="submit">Convert to Deal</Button></form></div>
  <form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2"><input type="hidden" name="id" value={lead.id}/><Input name="business_name" defaultValue={lead.business_name}/><Input name="owner_name" defaultValue={lead.owner_name}/><Input name="phone" defaultValue={lead.phone}/><Input name="email" defaultValue={lead.email}/><select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select><Input type="datetime-local" name="next_follow_up_at" defaultValue={formatDateTimeLocal(lead.next_follow_up_at)}/><textarea name="notes" defaultValue={lead.notes ?? ''} className="min-h-32 rounded-md border border-border bg-transparent p-2 text-sm md:col-span-2"/><Button type="submit" className="md:col-span-2">Save lead updates</Button></form></Card></div>;
}
