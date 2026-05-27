import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function AdminFundersPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, { data: routingInputs }, { data: legendRules }] = await Promise.all([
    supabase.from('funder_master').select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,required_docs,industry_yes,industry_maybe,industry_no,notes').order('funder_name'),
    supabase.from('funder_routing_inputs').select('input_name,example_value,rule_notes,sort_order').order('sort_order'),
    supabase.from('funder_legend_rules').select('legend_key,meaning').order('legend_key')
  ]);

  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Funder Master Foundation</h1><p className="text-sm text-muted-foreground">Imported lender guidelines from matrix.csv with router inputs and legend interpretation for future recommendation/routing logic.</p></div>
  <Card className="p-4"><h2 className="text-lg font-semibold">Routing Inputs (deal_router.csv)</h2><ul className="mt-2 list-disc pl-6 text-sm text-muted-foreground">{(routingInputs ?? []).map((input) => <li key={input.input_name}><span className="font-medium text-foreground">{input.input_name}</span> — Example: {input.example_value || '—'}; Rule: {input.rule_notes || '—'}</li>)}</ul></Card>
  <Card className="p-4"><h2 className="text-lg font-semibold">Legend Rules (legend.csv)</h2><ul className="mt-2 list-disc pl-6 text-sm text-muted-foreground">{(legendRules ?? []).map((rule) => <li key={rule.legend_key}><span className="font-medium text-foreground">{rule.legend_key}:</span> {rule.meaning}</li>)}</ul></Card>
  <Card className="overflow-x-auto rounded-xl border-border/80 p-0 shadow-sm"><table className="w-full min-w-[1500px] text-sm"><thead className="bg-muted/35 text-left"><tr><th className="p-3">Funder</th><th className="p-3">Submission</th><th className="p-3">Positions</th><th className="p-3">States</th><th className="p-3">Min Rev</th><th className="p-3">Min TIB</th><th className="p-3">Min FICO</th><th className="p-3">Max Funding</th><th className="p-3">Payment</th><th className="p-3">Industry YES</th><th className="p-3">Industry MAYBE</th><th className="p-3">Industry NO</th><th className="p-3">Docs / Notes</th></tr></thead><tbody>{(funders ?? []).map((funder) => <tr key={funder.funder_name} className="border-t border-border/80 align-top hover:bg-muted/20"><td className="p-3 font-medium">{funder.funder_name}</td><td className="p-3 uppercase">{funder.submission_method}</td><td className="p-3">{funder.positions || '—'}</td><td className="p-3">{funder.states || '—'}</td><td className="p-3">{funder.min_monthly_revenue ? `$${Number(funder.min_monthly_revenue).toLocaleString()}` : '—'}</td><td className="p-3">{funder.min_time_in_business_months ?? '—'}</td><td className="p-3">{funder.min_fico ?? '—'}</td><td className="p-3">{funder.max_funding ? `$${Number(funder.max_funding).toLocaleString()}` : '—'}</td><td className="p-3">{funder.payment_frequency || '—'}</td><td className="p-3">{funder.industry_yes || '—'}</td><td className="p-3">{funder.industry_maybe || '—'}</td><td className="p-3">{funder.industry_no || '—'}</td><td className="p-3">{funder.required_docs || '—'} {funder.notes ? `| ${funder.notes}` : ''}</td></tr>)}</tbody></table></Card></div>;
}
