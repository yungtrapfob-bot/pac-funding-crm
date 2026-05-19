import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function HotLeadsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const q = searchParams.q?.trim() ?? '';
  const status = searchParams.status?.trim() ?? '';
  let query = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').order('created_at', { ascending: false });
  if (profile.role === 'rep') query = query.eq('assigned_rep_id', profile.id);
  if (status) query = query.eq('follow_up_status', status);
  if (q) query = query.or(`business_name.ilike.%${q}%,owner_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await query;
  const hotLeads = data ?? [];

  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Hot Leads</h1><Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">New lead</Link></div>
  <Card><form className="grid grid-cols-1 gap-2 md:grid-cols-4"><Input name="q" defaultValue={q} placeholder="Search business, owner, email"/><select name="status" defaultValue={status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="">All statuses</option><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select><button className="rounded-md border border-border px-3 py-2 text-sm">Filter</button></form></Card>
  <Card className="p-0">{!hotLeads.length ? <p className="p-6 text-sm">No leads found for this filter.</p> : <table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-2">Business</th><th className="p-2">Owner</th><th className="p-2">Rep</th><th className="p-2">Status</th><th className="p-2">Next Follow-up</th></tr></thead><tbody>{hotLeads.map((lead) => <tr key={lead.id} className="border-t border-border"><td className="p-2"><Link href={`/hot-leads/${lead.id}`} className="text-primary hover:underline">{lead.business_name}</Link></td><td className="p-2">{lead.owner_name}</td><td className="p-2">{lead.profiles?.full_name || '—'}</td><td className="p-2">{lead.follow_up_status}</td><td className="p-2">{lead.next_follow_up_date || '—'}</td></tr>)}</tbody></table>}</Card></div>;
}
