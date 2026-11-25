import { readPages } from '@/lib/supabase/read-pages';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { UserRole } from '@/types/db';

export async function getDeals(role: UserRole, userId: string, repFilterId?: string) {
  const supabase = await createClient();
  let query = supabase.from('deals').select('*, assigned_rep:assigned_rep_id(full_name)')
    .order('submitted_at', { ascending: false }).order('id');
  if (role === 'rep') query = query.eq('assigned_rep_id', userId);
  if (role === 'admin' && repFilterId) query = query.eq('assigned_rep_id', repFilterId);
  return readPages((from, to) => query.range(from, to));
}

export async function getProcessingQueue(stage?: string) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [items, reps] = await Promise.all([
    readPages((from,to) => {
      let query = supabase.from('crm_sales_deal_queue')
        .select('id,business_name,assigned_rep_id,sales_processor_id,queue_stage,has_documents,submitted_at,sales_next_action,sales_follow_up_at')
        .eq('sales_test', false).order('submitted_at').order('id');
      query = stage ? query.eq('queue_stage', stage) : query.in('queue_stage', ['missing_documents','processing','submitted','underwriting','stipulations']);
      return query.range(from,to);
    }),
    readPages((from,to) => supabase.from('profiles').select('id,full_name').order('id').range(from,to)),
  ]);
  const names = new Map(reps.map(rep => [rep.id,rep.full_name]));
  return items.map(row => ({ ...row, assigned_name: names.get(row.assigned_rep_id),
    processor_name: names.get(row.sales_processor_id) }));
}
