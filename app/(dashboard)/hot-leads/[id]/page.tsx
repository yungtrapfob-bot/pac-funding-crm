import { updateHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function HotLeadDetail({ params }: { params: { id: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const leadQuery = supabase.from('hot_leads').select('*').eq('id', params.id);
  if (profile.role === 'rep') leadQuery.eq('assigned_rep_id', profile.id);
  const { data: lead } = await leadQuery.single();
  if (!lead) return <p>Lead not found.</p>;
  return <Card><h1 className="mb-3 text-xl font-semibold">{lead.business_name}</h1><form action={updateHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2"><input type="hidden" name="id" value={lead.id}/><Input name="business_name" defaultValue={lead.business_name}/><Input name="owner_name" defaultValue={lead.owner_name}/><Input name="phone" defaultValue={lead.phone}/><Input name="email" defaultValue={lead.email}/><select name="follow_up_status" defaultValue={lead.follow_up_status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select><Input type="date" name="next_follow_up_date" defaultValue={lead.next_follow_up_date ?? ''}/><textarea name="notes" defaultValue={lead.notes ?? ''} className="min-h-32 rounded-md border border-border bg-transparent p-2 text-sm md:col-span-2"/><Button type="submit" className="md:col-span-2">Save lead updates</Button></form></Card>;
}
