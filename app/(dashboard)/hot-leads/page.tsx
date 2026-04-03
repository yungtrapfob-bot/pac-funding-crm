import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function HotLeadsPage() {
  const { profile } = await requireUser();
  const supabase = createClient();
  let query = supabase.from('hot_leads').select('*, profiles:assigned_rep_id(full_name)').order('created_at', { ascending: false });
  if (profile.role === 'rep') query = query.eq('assigned_rep_id', profile.id);
  const { data } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hot Leads</h1>
        <Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">New lead</Link>
      </div>
      <Card className="p-0">
        {!data?.length ? (
          <p className="p-6 text-sm">No leads yet. Add your first hot lead.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr><th className="p-2">Business</th><th className="p-2">Owner</th><th className="p-2">Rep</th><th className="p-2">Next Follow-up</th></tr></thead>
            <tbody>{data.map((lead) => <tr key={lead.id} className="border-t border-border"><td className="p-2">{lead.business_name}</td><td className="p-2">{lead.owner_name}</td><td className="p-2">{(lead as any).profiles?.full_name}</td><td className="p-2">{lead.next_follow_up_date || '—'}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
