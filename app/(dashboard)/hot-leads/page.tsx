import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type SortMode = 'followup_soonest' | 'newest_created' | 'stale_followups';

function getSortLabel(sort: SortMode) {
  if (sort === 'newest_created') return 'Newest created';
  if (sort === 'stale_followups') return 'Stale follow-ups';
  return 'Next follow-up soonest';
}

export default async function HotLeadsPage({
  searchParams
}: {
  searchParams: { q?: string; status?: string; sort?: string; outcome?: string; rep?: string };
}) {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const q = searchParams.q?.trim() ?? '';
  const status = searchParams.status?.trim() ?? '';
  const outcome = searchParams.outcome?.trim() ?? '';
  const sort = (searchParams.sort?.trim() as SortMode) || 'followup_soonest';
  const rep = searchParams.rep?.trim() ?? '';
  const isAdmin = profile.role === 'admin';

  const { data: reps } = isAdmin
    ? await supabase.from('profiles').select('id,full_name').in('role', ['admin', 'rep']).order('full_name', { ascending: true })
    : { data: [] };

  let query = supabase.from('hot_leads').select('*');

  if (profile.role === 'rep') query = query.eq('assigned_rep_id', profile.id);
  if (isAdmin && rep) query = rep === 'unassigned' ? query.is('assigned_rep_id', null) : query.eq('assigned_rep_id', rep);
  if (status) query = query.eq('follow_up_status', status);
  if (outcome) query = query.eq('outcome_tag', outcome);
  if (q) {
    query = query.or(
      `business_name.ilike.%${q}%,owner_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,notes.ilike.%${q}%`
    );
  }

  if (sort === 'newest_created') query = query.order('created_at', { ascending: false });
  else query = query.order('next_follow_up_date', { ascending: true, nullsFirst: false });

  const { data } = await query;
  let hotLeads = data ?? [];

  const repIds = Array.from(
    new Set(hotLeads.map((lead) => lead.assigned_rep_id).filter((assignedRepId): assignedRepId is string => Boolean(assignedRepId)))
  );
  const { data: assignedRepProfiles } = repIds.length
    ? await supabase.from('profiles').select('id,full_name').in('id', repIds)
    : { data: [] };
  const assignedRepNameById = new Map((assignedRepProfiles ?? []).map((repProfile) => [repProfile.id, repProfile.full_name ?? null]));

  if (sort === 'stale_followups') {
    const now = Date.now();
    hotLeads = hotLeads
      .filter((lead) => lead.next_follow_up_date && new Date(lead.next_follow_up_date).getTime() < now)
      .sort((a, b) => new Date(a.next_follow_up_date).getTime() - new Date(b.next_follow_up_date).getTime());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hot Leads / Tasks</h1>
          <p className="text-sm text-muted-foreground">Rep call queue for follow-ups, callbacks, and submission readiness.</p>
        </div>
        <Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-white">
          New lead
        </Link>
      </div>

      <Card>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <Input name="q" defaultValue={q} placeholder="Search business, owner, phone, email, notes" />
          <select name="status" defaultValue={status} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="pending">pending</option>
            <option value="contacted">contacted</option>
            <option value="scheduled">scheduled</option>
            <option value="stale">stale</option>
          </select>
          <Input name="outcome" defaultValue={outcome} placeholder="Outcome tag" />
          <select name="sort" defaultValue={sort} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
            <option value="followup_soonest">Next follow-up soonest</option>
            <option value="newest_created">Newest created</option>
            <option value="stale_followups">Stale follow-ups</option>
          </select>
          {isAdmin ? (
            <select name="rep" defaultValue={rep} className="rounded-md border border-border bg-transparent px-3 py-2 text-sm">
              <option value="">All reps</option>
              <option value="unassigned">Unassigned</option>
              {(reps ?? []).map((internalRep) => (
                <option key={internalRep.id} value={internalRep.id}>
                  {internalRep.full_name ?? internalRep.id}
                </option>
              ))}
            </select>
          ) : (
            <Input name="rep" defaultValue={rep} placeholder="Assigned rep id" />
          )}
          <button className="rounded-md border border-border px-3 py-2 text-sm">Filter Queue</button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {!hotLeads.length ? (
          <p className="p-6 text-sm">No leads found for this queue view.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">Business</th><th className="p-2">Owner</th><th className="p-2">Phone</th><th className="p-2">Email</th>
                <th className="p-2">Assigned Rep</th><th className="p-2">Follow-up Status</th><th className="p-2">Next Follow-up</th><th className="p-2">Outcome</th><th className="p-2">Notes Preview</th>
              </tr>
            </thead>
            <tbody>
              {hotLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-2"><Link href={`/hot-leads/${lead.id}`} className="font-medium text-primary hover:underline">{lead.business_name}</Link></td>
                  <td className="p-2">{lead.owner_name}</td>
                  <td className="p-2">{lead.phone || '—'}</td>
                  <td className="p-2">{lead.email || '—'}</td>
                  <td className="p-2">{(lead.assigned_rep_id ? assignedRepNameById.get(lead.assigned_rep_id) : null) || '—'}</td>
                  <td className="p-2">{lead.follow_up_status}</td>
                  <td className="p-2">{lead.next_follow_up_date ? new Date(lead.next_follow_up_date).toLocaleString() : '—'}</td>
                  <td className="p-2">{lead.outcome_tag || '—'}</td>
                  <td className="max-w-xs truncate p-2 text-muted-foreground">{lead.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Sorted by: {getSortLabel(sort)}</p>
    </div>
  );
}
