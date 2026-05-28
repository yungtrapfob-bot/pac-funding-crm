import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { FunderMasterTable } from '@/components/admin/funder-master-table';
import { loadNormalizedFunderImport } from '@/lib/funder-master-import';

export default async function AdminFundersPage({ searchParams }: { searchParams?: { search?: string } }) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, fallbackImport] = await Promise.all([
    supabase
      .from('funder_master')
      .select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,submission_endpoint,required_docs,industry_yes,industry_maybe,industry_no,notes,matrix_row')
      .order('funder_name'),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Funder Deal Router</h1>
        <p className="text-sm text-muted-foreground">
          Spreadsheet-style funder routing for processing/admin. Enter deal fields, scan YES / MAYBE / NO results, and expand rows only when full guideline detail is needed.
        </p>
      </div>
      <FunderMasterTable funders={effectiveFunders} initialSearch={searchParams?.search || ""} />
    </div>
  );
}
