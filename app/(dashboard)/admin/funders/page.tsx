import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_DEAL_INPUTS, FunderMasterTable } from '@/components/admin/funder-master-table';
import { loadNormalizedFunderImport } from '@/lib/funder-master-import';
import { inferSubmissionMethodFromText, normalizeSubmissionMethod, type FunderMasterRecord, type StoredSubmissionMethod } from '@/lib/funder-routing';
import { updateFunderSubmissionConfig } from '@/actions/funders';

type SearchParams = { search?: string; dealId?: string };

const fieldValue = (value: unknown) => value == null ? '' : String(value);

function extractRequestedAmountFromInternalNotes(value?: string | null) {
  const match = value?.match(/Requested funding amount:\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

export default async function AdminFundersPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: funders }, fallbackImport, { data: dealRows }] = await Promise.all([
    supabase
      .from('funder_master')
      .select('id,funder_name,positions,states,min_monthly_revenue,min_time_in_business_months,min_fico,max_funding,payment_frequency,submission_method,submission_endpoint,primary_submission_email,submission_cc,submission_bcc,subject_template,body_template,required_document_types,internal_submission_notes,is_active,required_docs,industry_yes,industry_maybe,industry_no,notes,matrix_row')
      .order('funder_name'),
    loadNormalizedFunderImport(),
    searchParams?.dealId
      ? supabase
        .from('deals')
        .select('id,business_name,industry,state,positions,monthly_revenue,time_in_business_months,nsf_count,internal_notes,funded_amount,deposits,fico')
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
    requestedAmount: fieldValue(extractRequestedAmountFromInternalNotes(deal.internal_notes) ?? deal.funded_amount),
    depositsPerMonth: fieldValue(deal.deposits),
    fico: fieldValue(deal.fico)
  } : DEFAULT_DEAL_INPUTS;

  const effectiveFunders: FunderMasterRecord[] = (funders?.length ? funders.map((funder) => ({
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
    primary_submission_email: null,
    submission_cc: null,
    submission_bcc: null,
    subject_template: 'Submission: {{business_name}} - {{requested_amount}} - {{state}}',
    body_template: '',
    required_document_types: ['application', 'statement'],
    internal_submission_notes: null,
    is_active: true,
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

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Admin-only email submission configuration</h2>
        <p>Recipient emails, CC/BCC, templates, internal submission notes, required document types, and active status are loaded only on this admin route and are never hardcoded in UI components.</p>
        <div className="mt-3 space-y-3">
          {effectiveFunders.slice(0, 12).map((funder) => (
            <form key={funder.id ?? funder.funder_name} action={updateFunderSubmissionConfig} className="grid gap-2 rounded bg-white/70 p-3 md:grid-cols-4">
              <input type="hidden" name="id" value={funder.id ?? ''} />
              <p className="font-medium md:col-span-4">{funder.funder_name}</p>
              <select name="submission_method" defaultValue={String(funder.submission_method ?? 'tbd')} className="rounded-md border px-2 py-1"><option value="email">Email</option><option value="api">API</option><option value="portal">Portal</option><option value="manual_portal">Manual Portal</option><option value="tbd">TBD</option></select>
              <input name="primary_submission_email" defaultValue={funder.primary_submission_email ?? ''} placeholder="Primary submission email" className="rounded-md border px-2 py-1" />
              <input name="submission_cc" defaultValue={funder.submission_cc ?? ''} placeholder="CC" className="rounded-md border px-2 py-1" />
              <input name="submission_bcc" defaultValue={funder.submission_bcc ?? ''} placeholder="BCC" className="rounded-md border px-2 py-1" />
              <input name="subject_template" defaultValue={funder.subject_template ?? 'Submission: {{business_name}} - {{requested_amount}} - {{state}}'} className="rounded-md border px-2 py-1 md:col-span-2" />
              <input name="required_document_types" defaultValue={(funder.required_document_types ?? ['application','statement']).join(', ')} className="rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="body_template" defaultValue={funder.body_template ?? ''} className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="internal_submission_notes" defaultValue={funder.internal_submission_notes ?? ''} placeholder="Internal submission notes" className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={funder.is_active !== false} /> Active</label>
              <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">Save config</button>
            </form>
          ))}
        </div>
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
