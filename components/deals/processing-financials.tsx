'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { analyzeProcessingDocuments, saveProcessingUnderwriting } from '@/actions/processing-analysis';
import type { FinancialSummary } from '@/lib/document-analysis';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Run = { id: string; status: string; summary: FinancialSummary | null; document_ids: string[]; version: string; created_at: string };
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (cents: number | null) => cents === null ? 'Unavailable' : currency.format(cents / 100);
const fields = {
  requested: 'Requested amount', revenue: 'Monthly qualifying revenue', balance: 'Average daily balance',
  deposits: 'Monthly deposit count', positions: 'Existing positions', fico: 'FICO',
  nsfs: 'NSFs', negativeDays: 'Negative balance days', months: 'Months in business', industry: 'Industry', state: 'State',
};
const statusNames: Record<string,string> = { analyzing: 'Analyzing', needs_review: 'Needs review', complete: 'Analysis complete', failed: 'Analysis failed' };

export function ProcessingFinancials({ dealId, initial, company, runs, mode, readOnly }: {
  dealId: string; initial: Record<keyof typeof fields,string>; company: string;
  runs: Run[]; mode: string; readOnly: boolean;
}) {
  const [values,setValues] = useState(initial);
  const [message,setMessage] = useState('');
  const [pending,startTransition] = useTransition();
  const run = runs[0];
  const report = run?.summary;
  const application = report?.application;
  const maximum = Math.max(1, ...(report?.months ?? []).map(month => month.qualifyingRevenue));

  function work(operation: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) {
    setMessage('');
    startTransition(async () => {
      try { const result = await operation(); setMessage(result.ok ? success : result.message); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be completed.'); }
    });
  }
  function loadSuggestions() {
    if (!report) return;
    const averages = report.averages;
    const suggested = {
      ...values,
      revenue: averages?.qualifyingRevenue == null ? values.revenue : String(averages.qualifyingRevenue / 100),
      balance: averages?.dailyBalance == null ? values.balance : String(averages.dailyBalance / 100),
      deposits: averages?.deposits == null ? values.deposits : String(averages.deposits),
      nsfs: averages?.nsfs == null ? values.nsfs : String(averages.nsfs),
      negativeDays: averages?.negativeDays == null ? values.negativeDays : String(averages.negativeDays),
      requested: application?.requested_cents == null ? values.requested : String(application.requested_cents / 100),
      industry: application?.industry ?? values.industry,
      state: application?.state ?? values.state,
      months: application?.months_in_business == null ? values.months : String(application.months_in_business),
    };
    setValues(suggested);
  }

  return <Card id="processing-financials" className="space-y-3">
    <header className="flex flex-wrap justify-between gap-2">
      <div>
        <h2 className="font-semibold">Financial review</h2>
        <p className="text-xs text-muted-foreground">{run ? statusNames[run.status] : 'Analysis pending'} · Provider {mode}</p>
      </div>
      <Button disabled={pending || mode === 'disabled' || readOnly} onClick={() =>
        work(() => analyzeProcessingDocuments(dealId, Boolean(run)), 'Analysis request finished. Review the findings below.')}>
        {run ? 'Reanalyze documents' : 'Analyze documents'}
      </Button>
    </header>
    {message && <p role="status" className="rounded bg-muted/40 p-2 text-sm">{message}</p>}
    {report && <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Balances and totals are calculated from extracted entries. Deposit classifications and suspected advances require processor review.</p>
      {application && <details className="rounded border border-border p-2 text-sm">
        <summary className="cursor-pointer font-medium">Extracted application and CRM comparison</summary>
        <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr]">
          <dt>Legal name</dt><dd>{application.legal_name ?? 'Unavailable'} · CRM {company}</dd>
          <dt>DBA</dt><dd>{application.dba ?? 'Unavailable'}</dd>
          <dt>Address</dt><dd>{application.address ?? 'Unavailable'}</dd>
          <dt>Industry / state</dt><dd>{application.industry ?? 'Unavailable'} / {application.state ?? 'Unavailable'} · CRM {initial.industry || 'unknown'} / {initial.state || 'unknown'}</dd>
          <dt>Requested / time in business</dt><dd>{money(application.requested_cents)} / {application.months_in_business ?? 'Unavailable'} months · CRM {initial.requested || 'unknown'} / {initial.months || 'unknown'} months</dd>
          <dt>Existing obligations</dt><dd>{application.existing_obligations ?? 'Unavailable'}</dd>
          <dt>Source</dt><dd><Link prefetch={false} className="text-primary underline" href={`/api/deal-files/${run.document_ids[application.file]}`}>Application, page {application.page}</Link></dd>
        </dl>
      </details>}
      {!!report.flags.length && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Review flags · {report.flags.map(flag => flag.replaceAll('_',' ')).join(' · ')}</p>}
      {!!report.months.length && <>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-muted"><tr>{['Period','Deposits','Qualifying revenue','Count','Avg daily balance','Negative days','NSFs','Suspected MCA'].map(header => <th className="p-2" key={header}>{header}</th>)}</tr></thead>
            <tbody>{report.months.map(month => <tr key={month.start + month.source} className="border-t border-border">
              <td className="p-2"><Link prefetch={false} className="text-primary underline" href={`/api/deal-files/${run.document_ids[month.source]}`}>{month.start} to {month.end}</Link></td>
              <td className="p-2">{money(month.deposits)}</td><td className="p-2">{money(month.qualifyingRevenue)}</td>
              <td className="p-2">{month.depositCount}</td><td className="p-2">{money(month.averageBalance)}</td>
              <td className="p-2">{month.negativeDays ?? 'Unavailable'}</td><td className="p-2">{month.nsfs}</td>
              <td className="p-2">{money(month.potentialMca.reduce((sum,row) => sum - row.amount,0))}</td>
            </tr>)}
            {report.averages && <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="p-2">Period averages</td><td className="p-2">—</td><td className="p-2">{money(report.averages.qualifyingRevenue)}</td>
              <td className="p-2">{report.averages.deposits}</td><td className="p-2">{money(report.averages.dailyBalance)}</td>
              <td className="p-2">{report.averages.negativeDays}</td><td className="p-2">{report.averages.nsfs}</td><td className="p-2">—</td>
            </tr>}</tbody>
          </table>
        </div>
        <div aria-label="Extracted qualifying revenue by statement period" className="space-y-1">
          {report.months.map(month => <div key={month.start + month.source} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs">
            <span>{month.start.slice(0,7)}</span><span aria-hidden="true" className="h-1.5 rounded bg-emerald-100"><span className="block h-full rounded bg-primary"
              style={{ width: `${100 * month.qualifyingRevenue / maximum}%` }} /></span><span>{money(month.qualifyingRevenue)}</span>
          </div>)}
        </div>
        <details className="rounded border border-border p-2 text-xs">
          <summary className="cursor-pointer font-medium">Transaction evidence and suspected funding</summary>
          {report.months.map(month => <div className="mt-2" key={month.start + month.source}>
            <p className="font-medium">{month.start} to {month.end} · Opening {money(month.opening)} · Closing {money(month.closing)} · Withdrawals {money(month.withdrawals)} · Returned {month.returns}</p>
            <ul className="mt-1 space-y-0.5">
              {month.potentialMca.map((row,index) => <li key={`mca-${index}`}>{row.date} · {row.descriptor ?? 'Funding-like transaction'} · {money(-row.amount)} · page {row.page} · Unconfirmed</li>)}
              {month.adjustments.map((row,index) => <li key={`adjustment-${index}`}>{row.date} · {row.category.replaceAll('_',' ')} · {money(row.amount)} · page {row.page}</li>)}
            </ul>
          </div>)}
        </details>
      </>}
    </div>}
    <form className="space-y-2" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const approve = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'approve';
      work(() => saveProcessingUnderwriting(dealId, approve ? run?.id ?? null : null, data),
        approve ? 'Reviewed inputs saved and routing refreshed.' : 'Underwriting saved and routing refreshed.');
    }}>
      <p className="text-xs text-muted-foreground">Review each value. A blank field records unknown and zero records an observed zero.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(fields) as (keyof typeof fields)[]).map(field => <label key={field} className="grid gap-1 text-xs font-medium">
          {fields[field]}<Input name={field} value={values[field]} disabled={readOnly || pending}
            inputMode={field === 'industry' || field === 'state' ? 'text' : 'decimal'}
            onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
        </label>)}
      </div>
      {!readOnly && <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>Save reviewed underwriting</Button>
        {run?.status === 'needs_review' && Boolean(report?.months.length) && <>
          <Button type="button" disabled={pending} onClick={loadSuggestions}>Load extracted suggestions</Button>
          <Button type="submit" value="approve" disabled={pending}>Approve analysis and save</Button>
        </>}
      </div>}
    </form>
    {runs.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Analysis history</summary>
      <ul className="mt-1">{runs.map(entry => <li key={entry.id}>{entry.created_at.slice(0,10)} · {entry.version} · {statusNames[entry.status]}</li>)}</ul>
    </details>}
  </Card>;
}
