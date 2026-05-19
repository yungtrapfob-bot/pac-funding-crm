import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/db';

export async function getDeals(role: UserRole, userId: string) {
  const supabase = await createClient();
  let query = supabase.from('deals').select('*').order('submitted_at', { ascending: false });
  if (role === 'rep') query = query.eq('assigned_rep_id', userId);
  const { data } = await query;
  return data ?? [];
}

export async function getDashboardMetrics(role: UserRole, userId: string) {
  const supabase = await createClient();
  const deals = await getDeals(role, userId);
  const funded = deals.filter((d) => d.current_stage === 'Funded');
  const kif = deals.filter((d) => d.current_stage === 'KIF');

  let leadsQuery = supabase.from('hot_leads').select('id,next_follow_up_date,submission_ready');
  if (role === 'rep') leadsQuery = leadsQuery.eq('assigned_rep_id', userId);
  const { data: leads } = await leadsQuery;

  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const hotLeads = leads ?? [];
  const dueToday = hotLeads.filter((l) => {
    if (!l.next_follow_up_date) return false;
    const date = new Date(l.next_follow_up_date);
    return date >= start && date <= end;
  }).length;
  const overdueFollowups = hotLeads.filter((l) => l.next_follow_up_date && new Date(l.next_follow_up_date) < start).length;

  return {
    totalDeals: deals.length,
    underwriting: deals.filter((d) => d.current_stage === 'In Underwriting').length,
    offers: deals.filter((d) => d.current_stage === 'Offers').length,
    contractsOut: deals.filter((d) => d.current_stage === 'Contracts Out').length,
    fundedDeals: funded.length,
    kifDeals: kif.length,
    fundedAmount: funded.reduce((sum, d) => sum + Number(d.funded_amount ?? 0), 0),
    totalHotLeads: hotLeads.length,
    dueToday,
    overdueFollowups,
    readyForUnderwriting: hotLeads.filter((l) => Boolean(l.submission_ready)).length
  };
}
