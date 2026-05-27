import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/db';
import { toUiPipelineStage } from '@/lib/utils';

export async function getDeals(role: UserRole, userId: string, repFilterId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('deals')
    .select('*, assigned_rep:assigned_rep_id(full_name)')
    .order('submitted_at', { ascending: false });
  if (role === 'rep') query = query.eq('assigned_rep_id', userId);
  if (role === 'admin' && repFilterId) query = query.eq('assigned_rep_id', repFilterId);
  const { data } = await query;
  return data ?? [];
}

export async function getDashboardMetrics(role: UserRole, userId: string) {
  const supabase = await createClient();
  let dealsQuery = supabase
    .from('deals')
    .select('id,current_stage,funded_amount,assigned_rep_id');
  if (role === 'rep') dealsQuery = dealsQuery.eq('assigned_rep_id', userId);
  const { data: dealsData } = await dealsQuery;
  const deals = dealsData ?? [];

  const hasStage = (dealStage: string | null, acceptedRawStages: string[], acceptedUiStages: string[]) => {
    if (!dealStage) return false;
    if (acceptedRawStages.includes(dealStage)) return true;
    return acceptedUiStages.includes(toUiPipelineStage(dealStage));
  };

  const funded = deals.filter((d) => toUiPipelineStage(d.current_stage) === 'Funded');
  const kif = deals.filter((d) => toUiPipelineStage(d.current_stage) === 'KIF');

  let leadsQuery = supabase.from('hot_leads').select('id,next_follow_up_date,follow_up_status,outcome_tag');
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
    underwriting: deals.filter((d) => hasStage(d.current_stage, ['Application Submitted', 'Application Processed', 'In Underwriting'], ['In Underwriting'])).length,
    offers: deals.filter((d) => toUiPipelineStage(d.current_stage) === 'Offers').length,
    contractsOut: deals.filter((d) => toUiPipelineStage(d.current_stage) === 'Contracts Out').length,
    fundedDeals: funded.length,
    kifDeals: kif.length,
    fundedAmount: funded.reduce((sum, d) => sum + Number(d.funded_amount ?? 0), 0),
    totalHotLeads: hotLeads.length,
    dueToday,
    overdueFollowups,
    readyForUnderwriting: hotLeads.filter((l) => {
      const status = String(l.follow_up_status ?? '').toLowerCase();
      const outcome = String(l.outcome_tag ?? '').toLowerCase();
      return status === 'scheduled' || outcome.includes('underwriting') || outcome.includes('docs requested');
    }).length
  };
}
