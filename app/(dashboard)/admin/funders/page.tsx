import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_DEAL_INPUTS, FunderMasterTable } from '@/components/admin/funder-master-table';
import { readFunderInventory } from '@/lib/funder-inventory';
import { routingInputs } from '@/lib/processing-routing';
import { updateFunderSubmissionConfig } from '@/actions/funders';

type SearchParams = { search?: string; dealId?: string; configSaved?: string; configError?: string; funder?: string; config?: string };

const fieldValue = (value: unknown) => value == null ? '' : String(value);

export default async function AdminFundersPage({ searchParams: pendingSearchParams }: { searchParams: Promise<SearchParams> }) {
  const searchParams = await pendingSearchParams;
  await requireRole(['admin']);
  const supabase = await createClient();
  const [inventory, { data: dealRows }] = await Promise.all([
    readFunderInventory(supabase),
    searchParams?.dealId
      ? supabase
        .from('deals')
        .select('id,business_name,industry,state,positions,monthly_revenue,time_in_business_months,nsf_count,internal_notes,requested_amount,deposits,fico,processing_underwriting(negative_days)')
        .eq('id', searchParams.dealId)
        .limit(1)
      : Promise.resolve({ data: [] })
  ]);

  const deal = dealRows?.[0] ?? null;
  const review = Array.isArray(deal?.processing_underwriting) ? deal.processing_underwriting[0] : deal?.processing_underwriting;
  const routing = deal ? routingInputs({ ...deal, negative_days: review?.negative_days, underwriting_reviewed: Boolean(review) }) : null;
  const initialDealInputs = routing ? {
    industry: fieldValue(routing.industry),
    state: fieldValue(routing.state),
    position: fieldValue(routing.positions),
    monthlyRevenue: fieldValue(routing.monthlyRevenue),
    timeInBusinessMonths: fieldValue(routing.timeInBusinessMonths),
    nsfCount: fieldValue(routing.nsfCount),
    negativeDays: fieldValue(routing.negativeDays),
    requestedAmount: fieldValue(routing.requestedAmount),
    depositsPerMonth: fieldValue(routing.depositsPerMonth),
    fico: fieldValue(routing.fico)
  } : DEFAULT_DEAL_INPUTS;

  const { funders: effectiveFunders, duplicateKeys, unmatchedConfigs } = inventory;
  const active = effectiveFunders.filter(funder => funder.is_active);
  const inactive = effectiveFunders.filter(funder => !funder.is_active);
  const selected = effectiveFunders.find(funder => funder.id === searchParams.config);
  const emailMissing = active.filter(funder => funder.submission_method === 'email' && !funder.primary_submission_email).length;
  const methodMissing = active.filter(funder => funder.submission_method === 'tbd').length;
  const portalMissing = active.filter(funder => ['portal','manual_portal'].includes(funder.submission_method) && !funder.portal_url).length;
  const missing = (value: string | null) => !value?.trim() || /^(unknown|not specified|not stated|n\/a)$/i.test(value.trim());
  const guidelinesMissing = active.filter(funder => [funder.positions,funder.states,funder.required_docs].some(missing)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Funder Master</h1>
        <p className="text-sm text-muted-foreground">
          Compare active funders and open a row for the recorded guidelines and submission settings.
        </p>
      </div>

      <section id="submission-config" className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Submission configuration</h2>

        {searchParams?.configSaved ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">Saved submission configuration for {searchParams.configSaved}.</p> : null}
        {searchParams?.configError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-800">Unable to save submission configuration{searchParams.funder ? ` for ${searchParams.funder}` : ''}. Please review the values and try again; the detailed error was logged for admins.</p> : null}
        <p className="mt-2">{effectiveFunders.length} funders · {active.length} active · {methodMissing} missing method · {emailMissing} missing recipient · {portalMissing} missing portal URL · {guidelinesMissing} missing core guidelines · {duplicateKeys.length} duplicate keys · {unmatchedConfigs} unmatched configs</p>
        <div className="mt-3 space-y-3">
          {(selected ? [selected] : []).map((funder) => (
            <div key={funder.id} className="rounded border p-3"><h3 className="font-medium">{funder.funder_name}</h3><form action={updateFunderSubmissionConfig} className="mt-2 grid gap-2 md:grid-cols-4">
              <input type="hidden" name="funder_key" value={funder.key} />
              <input type="hidden" name="funder_name" value={funder.funder_name} />

              <select name="submission_method" defaultValue={String(funder.submission_method ?? 'tbd')} className="rounded-md border px-2 py-1"><option value="email">Email</option><option value="api">API</option><option value="portal">Portal</option><option value="manual_portal">Manual Portal</option><option value="tbd">TBD</option></select>
              <input name="primary_submission_email" defaultValue={funder.primary_submission_email ?? ''} placeholder="Primary submission email" className="rounded-md border px-2 py-1" />
              <input name="submission_cc" defaultValue={funder.submission_cc ?? ''} placeholder="CC" className="rounded-md border px-2 py-1" />
              <input name="portal_url" type="url" aria-label="HTTPS portal URL" defaultValue={funder.portal_url ?? ''} placeholder="HTTPS portal URL" className="rounded-md border px-2 py-1" />
              <input name="submission_bcc" defaultValue={funder.submission_bcc ?? ''} placeholder="BCC" className="rounded-md border px-2 py-1" />
              <input name="subject_template" defaultValue={funder.subject_template ?? 'Submission: {{business_name}} - {{requested_amount}} - {{state}}'} className="rounded-md border px-2 py-1 md:col-span-2" />
              <input name="required_document_types" defaultValue={(funder.required_document_types ?? ['application','statement']).join(', ')} className="rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="body_template" defaultValue={funder.body_template ?? ''} className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <textarea name="internal_submission_notes" defaultValue={funder.internal_submission_notes ?? ''} placeholder="Internal submission notes" className="min-h-24 rounded-md border px-2 py-1 md:col-span-2" />
              <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={funder.is_active !== false} disabled={!funder.masterActive} /> Active submission partner</label>
              <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="verify_destination" /> Independently verified the destination and recipients</label>
              <p className="text-xs text-muted-foreground">{funder.verified_at ? 'Destination was verified. Verify again when saving changes.' : 'Destination has not been verified.'}</p>
              <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit" disabled={funder.configurationAmbiguous}>Save config</button>
            </form></div>
          ))}
        </div>
      </section>

      <FunderMasterTable
        funders={active}
        dealId={searchParams.dealId}
        initialSearch={searchParams?.search || ''}
        initialDealInputs={initialDealInputs}
        dealContextLabel={deal?.business_name ? `deal ${deal.business_name}` : undefined}
      />
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Inactive guideline references ({inactive.length})</summary>
        <div className="mt-3 space-y-2">
          {inactive.map(funder => (
            <details key={funder.id} className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">{funder.funder_name}</summary>
              <dl className="my-2 grid gap-2 sm:grid-cols-2">
                {Object.entries(funder.matrix_row ?? {}).filter(([, value]) => value != null && value !== '').map(([label, value]) => (
                  <div key={label}><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{String(value)}</dd></div>
                ))}
              </dl>
              <Link href={{ pathname: '/admin/funders', query: { config: funder.id, dealId: searchParams.dealId }, hash: 'submission-config' }} className="text-primary underline">Submission settings</Link>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}
