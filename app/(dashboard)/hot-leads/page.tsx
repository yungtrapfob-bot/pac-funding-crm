import { formatPacificDateTime, pacificDate } from '@/lib/pacific-time';
import { readPages } from '@/lib/supabase/read-pages';
import { leadQueues, leadStages } from '@/lib/sales-labels';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LeadCheckbox, LeadSelection } from '@/components/hot-leads/lead-selection';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type SortMode = 'followup_soonest' | 'newest_created' | 'stale_followups';

function getSortLabel(sort: SortMode) {
  if (sort === 'newest_created') return 'Newest created';
  if (sort === 'stale_followups') return 'Stale follow-ups';
  return 'Next follow-up soonest';
}

function getStatusChip(status: string) {
  if (status === 'pending' || status === 'scheduled') return 'bg-amber-50 text-amber-900';
  if (status === 'contacted') return 'bg-blue-50 text-blue-900';
  if (status === 'stale') return 'bg-slate-100 text-slate-700';
  return 'bg-emerald-50 text-emerald-900';
}

export default async function HotLeadsPage({
  searchParams: pendingSearchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; outcome?: string; rep?: string; view?: string; due?: string; stage?: string; test?: string }>;
}) {
  const searchParams = await pendingSearchParams;
  const { profile } = await requireUser();
  const supabase = await createClient();
  const q = searchParams.q?.trim() ?? '';
  const status = searchParams.status?.trim() ?? '';
  const outcome = searchParams.outcome?.trim() ?? '';
  const sort = (searchParams.sort?.trim() as SortMode) || 'followup_soonest';
  const rep = searchParams.rep?.trim() ?? '';
  const isAdmin = profile.role === 'admin';

  const view = searchParams.view ?? 'active';
  const activeCountQuery = supabase.from('hot_leads').select('id', { count: 'exact', head: true })
    .is('archived_at', null).is('converted_at', null).eq('sales_lost', false).eq('sales_review', false).eq('sales_test', false);
  if (!isAdmin) activeCountQuery.eq('assigned_rep_id', profile.id);
  const { count: activeCount, error: countError } = await activeCountQuery;

  const { data: reps } = isAdmin
    ? await supabase.from('profiles').select('id,full_name,role,is_active').in('role', ['admin', 'rep']).order('full_name', { ascending: true })
    : { data: [] };

  let query = supabase.from('hot_leads').select('*');

  if (view === 'archived') query = query.not('archived_at', 'is', null);
  else if (view === 'converted') query = query.not('converted_at', 'is', null);
  else if (view === 'lost') query = query.eq('sales_lost', true);
  else if (view === 'review' && isAdmin) query = query.eq('sales_review', true);
  else if (view !== 'all' || !isAdmin) query = query.is('archived_at', null).is('converted_at', null).eq('sales_lost', false).eq('sales_review', false);
  if (view === 'active' && searchParams.test !== 'include') query = query.eq('sales_test', false);
  if (searchParams.stage === 'waiting') query = query.in('sales_stage', Object.keys(leadStages).filter(stage => stage !== 'interested'));
  else if (searchParams.stage && Object.hasOwn(leadStages, searchParams.stage)) query = query.eq('sales_stage', searchParams.stage);
  if (profile.role === 'rep') query = query.eq('assigned_rep_id', profile.id);
  if (isAdmin && rep) query = rep === 'unassigned' ? query.is('assigned_rep_id', null) : query.eq('assigned_rep_id', rep);
  if (status) query = query.eq('follow_up_status', status);
  if (outcome) query = query.eq('outcome_tag', outcome);
  if (q) {
    const encoded = JSON.stringify(`%${q}%`);
    query = query.or(
      `business_name.ilike.${encoded},owner_name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded},notes.ilike.${encoded}`
    );
  }

  if (sort === 'newest_created') query = query.order('created_at', { ascending: false });
  else query = query.order('next_follow_up_date', { ascending: true, nullsFirst: false });

  let error = false;
  let hotLeads: Awaited<typeof query>['data'] = [];
  query = query.order('id');
  try {
    hotLeads = await readPages((from, to) => query.range(from, to));
  } catch {
    error = true;
  }

  const repIds = Array.from(
    new Set(hotLeads.map((lead) => lead.assigned_rep_id).filter((assignedRepId): assignedRepId is string => Boolean(assignedRepId)))
  );
  const { data: assignedRepProfiles } = repIds.length
    ? await supabase.from('profiles').select('id,full_name').in('id', repIds)
    : { data: [] };
  const assignedRepNameById = new Map((assignedRepProfiles ?? []).map((repProfile) => [repProfile.id, repProfile.full_name ?? null]));

  const today = pacificDate(new Date());
  if (searchParams.due === 'today') {
    hotLeads = hotLeads.filter((lead) => lead.next_follow_up_date && pacificDate(lead.next_follow_up_date) === today);
  }
  if (searchParams.due === 'overdue') {
    hotLeads = hotLeads.filter((lead) => lead.next_follow_up_date && new Date(lead.next_follow_up_date).getTime() < Date.now());
  }
  if (searchParams.due === 'underwriting') {
    hotLeads = hotLeads.filter((lead) => lead.follow_up_status === 'scheduled' || /underwriting|docs requested/i.test(lead.outcome_tag ?? ''));
  }
  if (sort === 'stale_followups') {
    const now = Date.now();
    hotLeads = hotLeads
      .filter((lead) => lead.next_follow_up_date && new Date(lead.next_follow_up_date).getTime() < now)
      .sort((a, b) => new Date(a.next_follow_up_date).getTime() - new Date(b.next_follow_up_date).getTime());
  }

  const table = (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[hsl(var(--panel))] text-left">
              <tr>
                {isAdmin && <th scope="col" className="px-3 py-[14px]">Select</th>}
                <th className="px-3 py-[14px]">Business</th><th className="px-3 py-[14px]">Owner</th><th className="px-3 py-[14px]">Phone</th><th className="px-3 py-[14px]">Email</th>
                <th className="px-3 py-[14px]">Assigned Rep</th><th className="px-3 py-[14px]">Follow-up Status</th><th className="px-3 py-[14px]">Next Follow-up</th><th className="px-3 py-[14px]">Outcome</th><th className="px-3 py-[14px]">Notes Preview</th>
              </tr>
            </thead>
            <tbody>
              {hotLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-border/80 odd:bg-slate-50/70 hover:border-l-2 hover:border-l-primary hover:bg-[hsl(var(--row-hover))]">
                  {isAdmin && <td className="px-3"><LeadCheckbox lead={{ id: lead.id, name: lead.business_name }} /></td>}
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
                  <td className="mono-data px-3 py-[14px]">{lead.next_follow_up_date ? formatPacificDateTime(lead.next_follow_up_date) : '—'}</td>
                  <td className="mono-data px-3 py-[14px]">{lead.sales_review ? 'Review conversion' : lead.converted_at ? 'Converted' : lead.sales_lost ? 'Lost' : lead.sales_test ? 'Test record' : (leadStages[lead.sales_stage as keyof typeof leadStages] ?? 'Interested')}</td>
                  <td className="max-w-xs truncate px-3 py-[14px] text-muted-foreground">{lead.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
  );

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-800">Could not load the selected lead view.</p>}

      <div className="space-y-3 rounded-xl border border-border bg-[hsl(var(--panel))] p-4">
        <p className="tracked-label text-muted-foreground">Operations / Live Pipeline</p>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold">Hot Leads / Tasks</h1>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs tabular text-muted-foreground">{countError ? 'Count unavailable' : `${activeCount ?? 0} active`}</span>
          </div>
          <Link href="/hot-leads/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">New lead</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(leadQueues).filter(([id]) => isAdmin || !['review','all'].includes(id)).map(([id, label]) =>
            <Link key={id} href={`/hot-leads?view=${id}`} aria-current={view === id ? 'page' : undefined}
              className="rounded-full border border-border px-3 py-1.5 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{label}</Link>)}
          {isAdmin && <Link href={`/hot-leads?rep=${profile.id}`} className="rounded-full border border-border px-3 py-1.5">Mine</Link>}
          {isAdmin && <Link href="/hot-leads?rep=unassigned" className="rounded-full border border-border px-3 py-1.5">Unassigned</Link>}
          <Link href="/hot-leads?sort=stale_followups" className="rounded-full border border-border px-3 py-1.5">Stale</Link>
        </div>
      </div>

      <Card className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--card))] p-3 shadow-sm">
        <form className="flex flex-wrap items-center gap-2">
          {searchParams.due && <input type="hidden" name="due" value={searchParams.due} />}
          <input type="hidden" name="view" value={view} />
          <select name="stage" aria-label="Prospecting stage" defaultValue={searchParams.stage ?? ''} className="rounded border border-border px-2 py-1 text-sm">
            <option value="">All prospecting stages</option><option value="waiting">Waiting for application or statements</option>
            {Object.entries(leadStages).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <Input name="q" defaultValue={q} placeholder="Search business, owner, phone, email, notes" className="min-w-40 flex-1" />
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
          {view === 'active' && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="test" value="include" defaultChecked={searchParams.test === 'include'} />Include test leads</label>}
          <button className="rounded-full border border-border px-3 py-2 text-xs">Apply filters</button>
        </form>
      </Card>

      <Card className="overflow-x-auto rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--card))] p-0 shadow-sm">
        {isAdmin
          ? <LeadSelection reps={(reps ?? []).filter(rep => rep.role === 'rep' && rep.is_active)} leads={hotLeads.map((lead) => ({ id: lead.id, name: lead.business_name }))}>
              {hotLeads.length ? table : <p className="p-6 text-sm">No leads found for this queue view.</p>}
            </LeadSelection>
          : hotLeads.length ? table : <p className="p-6 text-sm">No leads found for this queue view.</p>}
      </Card>
      <p className="text-xs text-muted-foreground">Sorted by: {getSortLabel(sort)}</p>
    </div>
  );
}
