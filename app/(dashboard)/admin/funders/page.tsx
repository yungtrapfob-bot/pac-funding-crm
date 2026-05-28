import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { FunderMasterTable } from '@/components/admin/funder-master-table';
import { loadNormalizedFunderImport } from '@/lib/funder-master-import';

export default async function AdminFundersPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, { data: routingInputs }, { data: legendRules }, fallbackImport] = await Promise.all([
    supabase
      .from('funder_master')
      .select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,submission_endpoint,required_docs,industry_yes,industry_maybe,industry_no,notes,matrix_row')
      .order('funder_name'),
    supabase.from('funder_routing_inputs').select('input_name,example_value,rule_notes,sort_order').order('sort_order'),
    supabase.from('funder_legend_rules').select('legend_key,meaning').order('legend_key'),
    loadNormalizedFunderImport()
  ]);

  const effectiveFunders = (funders?.length ? funders : fallbackImport.funders.map((f) => ({
    funder_name: f.funderName,
    positions: f.positions,
    states: f.states,
    min_monthly_revenue: f.minMonthlyRevenue,
    min_time_in_business_months: f.minTimeInBusinessMonths,
    min_fico: f.minFico,
    max_funding: f.maxFunding,
    payment_frequency: f.paymentFrequency,
    submission_method: 'unknown_tbd',
    submission_endpoint: '',
    required_docs: f.requiredDocs,
    industry_yes: f.industryYes,
    industry_maybe: f.industryMaybe,
    industry_no: f.industryNo,
    notes: f.notes,
    matrix_row: f.matrixRow
  }))) ?? [];

  const effectiveRoutingInputs = (routingInputs?.length ? routingInputs : fallbackImport.routingInputs.map((r) => ({
    input_name: r.inputName,
    example_value: r.exampleValue,
    rule_notes: r.ruleNotes,
    sort_order: r.sortOrder
  }))) ?? [];

  const effectiveLegendRules = (legendRules?.length ? legendRules : fallbackImport.legendRules.map((l) => ({
    legend_key: l.legendKey,
    meaning: l.meaning
  }))) ?? [];

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
          {effectiveRoutingInputs.map((input) => (
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
          {effectiveLegendRules.map((rule) => (
            <li key={rule.legend_key}>
              <span className="font-medium text-foreground">{rule.legend_key}:</span> {rule.meaning}
            </li>
          ))}
        </ul>
      </Card>
      <FunderMasterTable funders={effectiveFunders} />
    </div>
  );
}
