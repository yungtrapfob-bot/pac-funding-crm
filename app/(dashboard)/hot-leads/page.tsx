import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type HotLeadRow = {
  id: string;
  business_name: string;
  owner_name: string;
  next_follow_up_date: string | null;
  profiles: { full_name: string | null } | null;
};

function normalizeHotLeadRows(data: unknown[] | null): HotLeadRow[] {
  if (!data) return [];

  return data.map((item) => {
    const row = item as {
      id: string;
      business_name: string;
      owner_name: string;
      next_follow_up_date?: string | null;
      profiles?: { full_name?: string | null } | null;
    };

    return {
      id: row.id,
      business_name: row.business_name,
      owner_name: row.owner_name,
      next_follow_up_date: row.next_follow_up_date ?? null,
      profiles: row.profiles
        ? {
            full_name: row.profiles.full_name ?? null
          }
        : null
    };
  });
}

export default async function HotLeadsPage() {
  const { profile } = await requireUser();
  const supabase = createClient();
  let query = supabase
    .from('hot_leads')
    .select('id, business_name, owner_name, next_follow_up_date, profiles:assigned_rep_id(full_name)')
    .order('created_at', { ascending: false });
  if (profile.role === 'rep') query = query.eq('assigned_rep_id', profile.id);
  const { data } = await query;
  const leads = normalizeHotLeadRows(data as unknown[] | null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hot Leads</h1>
        <Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">
          New lead
        </Link>
      </div>
      <Card className="p-0">
        {!leads.length ? (
          <p className="p-6 text-sm">No leads yet. Add your first hot lead.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">Business</th>
                <th className="p-2">Owner</th>
                <th className="p-2">Rep</th>
                <th className="p-2">Next Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="p-2">{lead.business_name}</td>
                  <td className="p-2">{lead.owner_name}</td>
                  <td className="p-2">{lead.profiles?.full_name ?? '—'}</td>
                  <td className="p-2">{lead.next_follow_up_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
