import { readFunderInventory } from '@/lib/funder-inventory';
import { evaluateProcessingFunders } from '@/lib/processing-routing';
import { readPages } from '@/lib/supabase/read-pages';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { UserRole } from '@/types/db';

export async function getDeals(role: UserRole, userId: string, repFilterId?: string, archived = false) {
  const supabase = await createClient();
  let query = supabase.from('deals').select('*, assigned_rep:assigned_rep_id(full_name)')
    .order('submitted_at', { ascending: false }).order('id');
  query = archived && role === 'admin' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (role === 'rep') query = query.eq('assigned_rep_id', userId);
  if (role === 'admin' && repFilterId) query = query.eq('assigned_rep_id', repFilterId);
  return readPages((from, to) => query.range(from, to));
}

export async function getProcessingQueue(stage?: string) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [items, reps, { funders }] = await Promise.all([
    readPages((from,to) => {
      let query = supabase.from('crm_sales_deal_queue')
        .select('id,business_name,assigned_rep_id,sales_processor_id,queue_stage,has_documents,application_review_required,application_reviewed_at,requested_amount,submitted_at,sales_next_action,sales_follow_up_at')
        .eq('sales_test', false).is('archived_at', null).order('submitted_at').order('id');
      query = stage ? query.eq('queue_stage', stage) : query.in('queue_stage', ['missing_documents','processing','submitted','underwriting','stipulations']);
      return query.range(from,to);
    }),
    readPages((from,to) => supabase.from('profiles').select('id,full_name').order('id').range(from,to)),
    readFunderInventory(supabase),
  ]);
  const names = new Map(reps.map(rep => [rep.id,rep.full_name]));
  const deals = new Map();
  const ids = items.map(row => row.id);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('deals')
      .select('id,monthly_revenue,time_in_business_months,fico,positions,nsf_count,deposits,state,industry,requested_amount,internal_notes')
      .in('id', ids.slice(offset, offset + 100));
    if (error) throw new Error('Processing deal inputs are unavailable.');
    for (const deal of data) deals.set(deal.id, deal);
  }
  return items.map(row => {
    const counts = { YES: 0, MAYBE: 0, NO: 0 };
    for (const result of evaluateProcessingFunders(funders, deals.get(row.id) ?? {})) counts[result.fit]++;
    return { ...row, counts, assigned_name: names.get(row.assigned_rep_id), processor_name: names.get(row.sales_processor_id) };
  });
}
