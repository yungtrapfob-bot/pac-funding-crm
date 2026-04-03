import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/db';

export async function getDeals(role: UserRole, userId: string) {
  const supabase = createClient();
  let query = supabase.from('deals').select('*').order('submitted_at', { ascending: false });
  if (role === 'rep') query = query.eq('assigned_rep_id', userId);
  const { data } = await query;
  return data ?? [];
}

export async function getDashboardMetrics(role: UserRole, userId: string) {
  const deals = await getDeals(role, userId);
  const approvals = deals.filter((d) => ['Offers / Declines Received', 'Deal Pitched', 'Contracts Requested', 'Contracts Signed', 'Funded'].includes(d.current_stage));
  const funded = deals.filter((d) => d.current_stage === 'Funded');
  const killed = deals.filter((d) => d.current_stage === 'Killed');

  return {
    submitted: deals.length,
    approvals: approvals.length,
    openDeals: deals.filter((d) => !['Funded', 'Killed'].includes(d.current_stage)).length,
    fundedDeals: funded.length,
    killedDeals: killed.length,
    fundedAmount: funded.reduce((sum, d) => sum + Number(d.funded_amount ?? 0), 0)
  };
}
