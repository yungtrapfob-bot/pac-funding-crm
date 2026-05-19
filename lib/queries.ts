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
  const deals = await getDeals(role, userId);
  const funded = deals.filter((d) => d.current_stage === 'Funded');
  const kif = deals.filter((d) => d.current_stage === 'KIF');
  return {
    totalDeals: deals.length,
    underwriting: deals.filter((d) => d.current_stage === 'In Underwriting').length,
    offers: deals.filter((d) => d.current_stage === 'Offers').length,
    contractsOut: deals.filter((d) => d.current_stage === 'Contracts Out').length,
    fundedDeals: funded.length,
    kifDeals: kif.length,
    fundedAmount: funded.reduce((sum, d) => sum + Number(d.funded_amount ?? 0), 0)
  };
}
