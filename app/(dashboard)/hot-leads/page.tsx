import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HotLeadRowActions } from '@/components/hot-leads/hot-lead-row-actions';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type SortMode = 'followup_soonest' | 'newest_created' | 'stale_followups';

function getSortLabel(sort: SortMode) {
  if (sort === 'newest_created') return 'Newest created';
  if (sort === 'stale_followups') return 'Stale follow-ups';
  return 'Next follow-up soonest';
}

function getStatusChip(status: string) {
  if (status === 'pending' || status === 'scheduled') return 'bg-warning/20 text-warning';
  if (status === 'contacted') return 'bg-info/20 text-info';
  if (status === 'stale') return 'bg-slate-100 text-slate-700';
  return 'bg-success/20 text-success';
}

export default async function HotLeadsPage({
  searchParams
}: {
  searchParams: { q?: string; status?: string; sort?: string; outcome?: string; rep?: string; deleted?: string };
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
      {searchParams.deleted === '1' ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">Hot lead deleted.</div> : null}

      <div className="space-y-3 rounded-xl border border-border bg-[hsl(var(--panel))] p-4">
        <p className="tracked-label text-muted-foreground">Operations / Live Pipeline</p>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold">Hot Leads / Tasks</h1>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs tabular text-muted-foreground">247 active</span>
          </div>
          <Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">New lead</Link>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {['All', 'Mine', 'Unassigned', 'Stale'].map((tab) => <button key={tab} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground">{tab}</button>)}
        </div>
      </div>

      <Card className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--card))] p-3 shadow-sm">
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Search business, owner, phone, email, notes" className="min-w-[320px] flex-1" />
          <select name="status" defaultValue={status} className="rounded-full border border-border bg-transparent px-3 py-2 text-xs">
            <option value="">All statuses</option>
            <option value="pending">pending</option>
            <option value="contacted">contacted</option>
            <option value="scheduled">scheduled</option>
            <option value="stale">stale</option>
          </select>
          <select name="sort" defaultValue={sort} className="rounded-full border border-border bg-transparent px-3 py-2 text-xs">
            <option value="followup_soonest">Next follow-up soonest</option>
            <option value="newest_created">Newest created</option>
            <option value="stale_followups">Stale follow-ups</option>
          </select>
          {isAdmin ? (<select name="rep" defaultValue={rep} className="rounded-full border border-border bg-transparent px-3 py-2 text-xs">
              <option value="">All reps</option>
              <option value="unassigned">Unassigned</option>
              {(reps ?? []).map((internalRep) => (
                <option key={internalRep.id} value={internalRep.id}>
                  {internalRep.full_name ?? internalRep.id}
                </option>
              ))}
            </select>) : null}
          <button className="rounded-full border border-border px-3 py-2 text-xs">Saved views</button>
        </form>
      </Card>

      <Card className="overflow-x-auto rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--card))] p-0 shadow-sm">
        {!hotLeads.length ? (
          <p className="p-6 text-sm">No leads found for this queue view.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[hsl(var(--panel))] text-left">
              <tr>
                <th className="px-3 py-[14px]">Business</th><th className="px-3 py-[14px]">Owner</th><th className="px-3 py-[14px]">Phone</th><th className="px-3 py-[14px]">Email</th>
                <th className="px-3 py-[14px]">Assigned Rep</th><th className="px-3 py-[14px]">Follow-up Status</th><th className="px-3 py-[14px]">Next Follow-up</th><th className="px-3 py-[14px]">Outcome</th><th className="px-3 py-[14px]">Notes Preview</th><th className="px-3 py-[14px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hotLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-border/80 odd:bg-slate-50/70 hover:border-l-2 hover:border-l-primary hover:bg-[hsl(var(--row-hover))]">
                  <td className="px-3 py-[14px]"><Link href={`/hot-leads/${lead.id}`} className="font-medium text-foreground hover:text-primary">{lead.business_name}</Link></td>
                  <td className="px-3 py-[14px]">{lead.owner_name}</td>
                  <td className="mono-data px-3 py-[14px]">{lead.phone || '—'}</td>
                  <td className="mono-data px-3 py-[14px]">{lead.email || '—'}</td>
                  <td className="px-3 py-[14px]">
                    {(lead.assigned_rep_id ? assignedRepNameById.get(lead.assigned_rep_id) : null)
                      ? <Badge className="bg-slate-100 text-slate-700">{assignedRepNameById.get(lead.assigned_rep_id as string)}</Badge>
                      : <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-3 py-[14px]"><span className={`chip inline-flex rounded-full px-2 py-1 ${getStatusChip(lead.follow_up_status ?? '')}`}>{lead.follow_up_status || 'ready'}</span></td>
                  <td className="mono-data px-3 py-[14px]">{lead.next_follow_up_date ? new Date(lead.next_follow_up_date).toLocaleString() : '—'}</td>
                  <td className="mono-data px-3 py-[14px]">{lead.outcome_tag || '—'}</td>
                  <td className="max-w-xs truncate px-3 py-[14px] text-muted-foreground">{lead.notes || '—'}</td>
                  <td className="px-3 py-[14px] text-right">
                    <HotLeadRowActions leadId={lead.id} businessName={lead.business_name ?? 'this lead'} isAdmin={isAdmin} />
                  </td>
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
