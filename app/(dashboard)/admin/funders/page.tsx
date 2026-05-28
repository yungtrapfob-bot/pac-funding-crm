import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { FunderMasterTable } from '@/components/admin/funder-master-table';

export default async function AdminFundersPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, { data: routingInputs }, { data: legendRules }] = await Promise.all([
    supabase
      .from('funder_master')
      .select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,submission_endpoint,required_docs,industry_yes,industry_maybe,industry_no,notes,matrix_row')
      .order('funder_name'),
    supabase.from('funder_routing_inputs').select('input_name,example_value,rule_notes,sort_order').order('sort_order'),
    supabase.from('funder_legend_rules').select('legend_key,meaning').order('legend_key')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Funder Master Foundation</h1>
        <p className="text-sm text-muted-foreground">
          Imported lender guidelines from matrix.csv with router inputs and legend interpretation for future recommendation/routing logic.
        </p>
      </div>
      <Card className="p-4">
        <h2 className="text-lg font-semibold">Routing Inputs (deal_router.csv)</h2>
        <ul className="mt-2 list-disc pl-6 text-sm text-muted-foreground">
          {(routingInputs ?? []).map((input) => (
            <li key={input.input_name}>
              <span className="font-medium text-foreground">{input.input_name}</span> — Example: {input.example_value || '—'}; Rule:{' '}
              {input.rule_notes || '—'}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4">
        <h2 className="text-lg font-semibold">Legend Rules (legend.csv)</h2>
        <ul className="mt-2 list-disc pl-6 text-sm text-muted-foreground">
          {(legendRules ?? []).map((rule) => (
            <li key={rule.legend_key}>
              <span className="font-medium text-foreground">{rule.legend_key}:</span> {rule.meaning}
            </li>
          ))}
        </ul>
      </Card>
      <FunderMasterTable funders={funders ?? []} />
    </div>
  );
}
