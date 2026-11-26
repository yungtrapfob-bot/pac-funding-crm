import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_DEAL_INPUTS, FunderMasterTable } from '@/components/admin/funder-master-table';
import { readFunderInventory } from '@/lib/funder-inventory';
import { updateFunderSubmissionConfig } from '@/actions/funders';

type SearchParams = { search?: string; dealId?: string; configSaved?: string; configError?: string; funder?: string };

const fieldValue = (value: unknown) => value == null ? '' : String(value);

function extractRequestedAmountFromInternalNotes(value?: string | null) {
  const match = value?.match(/Requested funding amount:\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

export default async function AdminFundersPage({ searchParams: pendingSearchParams }: { searchParams: Promise<SearchParams> }) {
  const searchParams = await pendingSearchParams;
  await requireRole(['admin']);
  const supabase = await createClient();
  const [inventory, { data: dealRows }] = await Promise.all([
    readFunderInventory(supabase),
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

  const { funders: effectiveFunders, duplicateKeys, unmatchedConfigs } = inventory;
  const active = effectiveFunders.filter(funder => funder.is_active);
  const emailMissing = active.filter(funder => funder.submission_method === 'email' && !funder.primary_submission_email).length;
  const methodMissing = active.filter(funder => funder.submission_method === 'tbd').length;
  const portalMissing = active.filter(funder => ['portal','manual_portal'].includes(funder.submission_method) && !funder.submission_endpoint).length;
  const guidelinesMissing = active.filter(funder => !funder.positions || !funder.states || !funder.required_docs).length;

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
        {searchParams?.configSaved ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">Saved submission configuration for {searchParams.configSaved}.</p> : null}
        {searchParams?.configError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-800">Unable to save submission configuration{searchParams.funder ? ` for ${searchParams.funder}` : ''}. Please review the values and try again; the detailed error was logged for admins.</p> : null}
        <p className="mt-2">{effectiveFunders.length} funders · {active.length} active · {methodMissing} missing method · {emailMissing} missing recipient · {portalMissing} missing portal URL · {guidelinesMissing} missing core guidelines · {duplicateKeys.length} duplicate keys · {unmatchedConfigs} unmatched configs</p>
        <div className="mt-3 space-y-3">
          {effectiveFunders.map((funder) => (
            <details key={funder.id} className="rounded bg-white/70 p-3"><summary className="cursor-pointer font-medium">{funder.funder_name}</summary><form action={updateFunderSubmissionConfig} className="mt-2 grid gap-2 md:grid-cols-4">
              <input type="hidden" name="funder_key" value={funder.key} />
              <input type="hidden" name="funder_name" value={funder.funder_name} />

              <select name="submission_method" defaultValue={String(funder.submission_method ?? 'tbd')} className="rounded-md border px-2 py-1"><option value="email">Email</option><option value="api">API</option><option value="portal">Portal</option><option value="manual_portal">Manual Portal</option><option value="tbd">TBD</option></select>
              <input name="primary_submission_email" defaultValue={funder.primary_submission_email ?? ''} placeholder="Primary submission email" className="rounded-md border px-2 py-1" />
              <input name="submission_cc" defaultValue={funder.submission_cc ?? ''} placeholder="CC" className="rounded-md border px-2 py-1" />
              <input name="submission_bcc" defaultValue={funder.submission_bcc ?? ''} placeholder="BCC" className="rounded-md border px-2 py-1" />
              <input name="subject_template" defaultValue={funder.subject_template ?? 'Submission: {{business_name}} - {{requested_amount}} - {{state}}'} className="rounded-md border px-2 py-1 md:col-span-2" />
              <input name="required_document_types" defaultValue={(funder.required_document_types ?? ['application','statement']).join(', ')} className="rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="body_template" defaultValue={funder.body_template ?? ''} className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="internal_submission_notes" defaultValue={funder.internal_submission_notes ?? ''} placeholder="Internal submission notes" className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={funder.is_active !== false} /> Active</label>
              <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit" disabled={funder.configurationAmbiguous}>Save config</button>
            </form></details>
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
