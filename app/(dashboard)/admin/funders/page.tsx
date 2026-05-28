import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_DEAL_INPUTS, FunderMasterTable } from '@/components/admin/funder-master-table';
import { loadNormalizedFunderImport } from '@/lib/funder-master-import';
import { inferSubmissionMethodFromText, normalizeSubmissionMethod, type StoredSubmissionMethod } from '@/lib/funder-routing';

type SearchParams = { search?: string; dealId?: string };

const fieldValue = (value: unknown) => value == null ? '' : String(value);

export default async function AdminFundersPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, fallbackImport, { data: dealRows }] = await Promise.all([
    supabase
      .from('funder_master')
      .select('funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,submission_endpoint,required_docs,industry_yes,industry_maybe,industry_no,notes,matrix_row')
      .order('funder_name'),
    loadNormalizedFunderImport(),
    searchParams?.dealId
      ? supabase
        .from('deals')
        .select('id,business_name,industry,state,positions,monthly_revenue,time_in_business_months,nsf_count,requested_amount,funded_amount,deposits,fico')
        .eq('id', searchParams.dealId)
        .limit(1)
      : Promise.resolve({ data: [] })
  ]);

  const deal = dealRows?.[0] ?? null;
  const initialDealInputs = deal ? {
    industry: fieldValue(deal.industry),
    state: fieldValue(deal.state),
    position: fieldValue(deal.positions),
    monthlyRevenue: fieldValue(deal.monthly_revenue),
    timeInBusinessMonths: fieldValue(deal.time_in_business_months),
    nsfCount: fieldValue(deal.nsf_count),
    requestedAmount: fieldValue(deal.requested_amount ?? deal.funded_amount),
    depositsPerMonth: fieldValue(deal.deposits),
    fico: fieldValue(deal.fico)
  } : DEFAULT_DEAL_INPUTS;

  const effectiveFunders = (funders?.length ? funders.map((funder) => ({
    ...funder,
    submission_method: normalizeSubmissionMethod(funder.submission_method as StoredSubmissionMethod)
  })) : fallbackImport.funders.map((f) => ({
    funder_name: f.funderName,
    positions: f.positions,
    states: f.states,
    min_monthly_revenue: f.minMonthlyRevenue,
    min_time_in_business_months: f.minTimeInBusinessMonths,
    min_fico: f.minFico,
    max_funding: f.maxFunding,
    payment_frequency: f.paymentFrequency,
    submission_method: inferSubmissionMethodFromText(f.notes, f.requiredDocs),
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
      <FunderMasterTable
        funders={effectiveFunders}
        initialSearch={searchParams?.search || ''}
        initialDealInputs={initialDealInputs}
        dealContextLabel={deal?.business_name ? `deal ${deal.business_name}` : undefined}
      />
    </div>
  );
}
