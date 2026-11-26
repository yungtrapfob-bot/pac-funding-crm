'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { evaluateFunders, submissionMethodLabel, type FunderMasterRecord, type RoutingFit, type SubmissionMethod } from '@/lib/funder-routing';

type Funder = FunderMasterRecord & { id: string };

type DealInputState = {
  industry: string;
  state: string;
  position: string;
  monthlyRevenue: string;
  timeInBusinessMonths: string;
  nsfCount: string;
  negativeDays: string;
  requestedAmount: string;
  depositsPerMonth: string;
  fico: string;
};

export const DEFAULT_DEAL_INPUTS: DealInputState = {
  industry: 'supplements',
  state: 'NJ',
  position: '1',
  monthlyRevenue: '189000',
  timeInBusinessMonths: '36',
  nsfCount: '0',
  negativeDays: '',
  requestedAmount: '',
  depositsPerMonth: '2',
  fico: '800'
};

const KEY_MATRIX_FIELDS = [
  'Min Funding',
  'Max NSFs/Neg Days',
  'Min Deposits/Month',
  'Defaults',
  'Statement Months Required',
  'Statement Months (NY/CA)',
  'Side-by-Side',
  'Max Term (Days)',
  'Max Term (Weeks)',
  'Buy Rate (20+ wks)',
  'Buy Rate (<20 wks)',
  'Early Payoff'
] as const;

const parseNullableNumber = (value: string) => {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const money = (value: number | null) => value == null ? '—' : `$${Number(value).toLocaleString()}`;
const plain = (value: string | null) => value && value.trim().length > 0 ? value : '—';

const fitClass: Record<RoutingFit, string> = {
  YES: 'border-emerald-400/50 bg-emerald-50 text-emerald-800',
  MAYBE: 'border-amber-400/50 bg-amber-50 text-amber-800',
  NO: 'border-red-400/50 bg-red-50 text-red-800'
};

const rowClass: Record<RoutingFit, string> = {
  YES: 'border-l-4 border-l-emerald-400/80 bg-emerald-50 hover:bg-emerald-100/70',
  MAYBE: 'border-l-4 border-l-amber-400/80 bg-amber-50 hover:bg-amber-100/70',
  NO: 'border-l-4 border-l-red-400/80 bg-red-50 hover:bg-red-100/70'
};

function inputLabel(label: string, children: ReactNode) {
  return (
    <label className="space-y-1 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FunderMasterTable({ funders, initialSearch = '', initialDealInputs = DEFAULT_DEAL_INPUTS, dealContextLabel, dealId }: { funders: Funder[]; initialSearch?: string; initialDealInputs?: DealInputState; dealContextLabel?: string; dealId?: string }) {
  const [dealInputs, setDealInputs] = useState(initialDealInputs);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [fitFilter, setFitFilter] = useState<'all' | RoutingFit>('all');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | SubmissionMethod>('all');

  const routingDeal = useMemo(() => ({
    industry: dealInputs.industry.trim() || null,
    state: dealInputs.state.trim().toUpperCase() || null,
    positions: parseNullableNumber(dealInputs.position),
    monthlyRevenue: parseNullableNumber(dealInputs.monthlyRevenue),
    timeInBusinessMonths: parseNullableNumber(dealInputs.timeInBusinessMonths),
    nsfCount: parseNullableNumber(dealInputs.nsfCount),
    negativeDays: parseNullableNumber(dealInputs.negativeDays),
    requestedAmount: parseNullableNumber(dealInputs.requestedAmount),
    depositsPerMonth: parseNullableNumber(dealInputs.depositsPerMonth),
    fico: parseNullableNumber(dealInputs.fico)
  }), [dealInputs]);

  const results = useMemo(() => evaluateFunders(funders, routingDeal), [funders, routingDeal]);
  const funderById = useMemo(() => new Map(funders.map(funder => [funder.id, funder])), [funders]);

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter((result) => {
      const funder = funderById.get(result.funderId ?? '');
      const searchable = [
        result.funderName,
        result.fit,
        result.summary,
        result.positions,
        result.states,
        result.industrySummary,
        funder?.notes,
        funder?.industry_yes,
        funder?.industry_maybe,
        funder?.industry_no
      ].join(' ').toLowerCase();
      const matchesSearch = query.length === 0 || searchable.includes(query);
      const matchesFit = fitFilter === 'all' || result.fit === fitFilter;
      const matchesSubmission = submissionFilter === 'all' || result.submissionMethod === submissionFilter;
      return matchesSearch && matchesFit && matchesSubmission;
    });
  }, [fitFilter, funderById, results, search, submissionFilter]);

  const counts = useMemo(() => ({
    YES: results.filter((result) => result.fit === 'YES').length,
    MAYBE: results.filter((result) => result.fit === 'MAYBE').length,
    NO: results.filter((result) => result.fit === 'NO').length
  }), [results]);

  const updateInput = (key: keyof DealInputState, value: string) => setDealInputs((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Deal Router Inputs</h2>
            <p className="text-sm text-muted-foreground">{dealContextLabel ? `Auto-filled from ${dealContextLabel}. Adjust any field before routing.` : 'Enter the deal once; routing updates funder-by-funder below.'}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">GO {counts.YES}</Badge>
            <Badge className="border-amber-200 bg-amber-50 text-amber-800">MAYBE {counts.MAYBE}</Badge>
            <Badge className="border-red-200 bg-red-50 text-red-800">NO {counts.NO}</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {inputLabel('Industry', <Input value={dealInputs.industry} onChange={(e) => updateInput('industry', e.target.value)} placeholder="e.g. trucking" />)}
          {inputLabel('State (2-letter)', <Input value={dealInputs.state} onChange={(e) => updateInput('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="NJ" />)}
          {inputLabel('Position Needed', (
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={dealInputs.position} onChange={(e) => updateInput('position', e.target.value)}>
              <option value="">Any / unknown</option>
              {Array.from({ length: 11 }, (_, index) => index + 1).map((position) => <option key={position} value={String(position)}>{position}</option>)}
            </select>
          ))}
          {inputLabel('Monthly Revenue', <Input inputMode="numeric" value={dealInputs.monthlyRevenue} onChange={(e) => updateInput('monthlyRevenue', e.target.value)} placeholder="75000" />)}
          {inputLabel('Time in Business (months)', <Input inputMode="numeric" value={dealInputs.timeInBusinessMonths} onChange={(e) => updateInput('timeInBusinessMonths', e.target.value)} placeholder="18" />)}
          {inputLabel('NSFs (monthly)', <Input inputMode="numeric" value={dealInputs.nsfCount} onChange={(e) => updateInput('nsfCount', e.target.value)} placeholder="4" />)}
          {inputLabel('Negative days (monthly)', <Input inputMode="numeric" value={dealInputs.negativeDays} onChange={(e) => updateInput('negativeDays', e.target.value)} />)}
          {inputLabel('Funding Amount Requested', <Input inputMode="numeric" value={dealInputs.requestedAmount} onChange={(e) => updateInput('requestedAmount', e.target.value)} placeholder="60000" />)}
          {inputLabel('Deposits / Month', <Input inputMode="numeric" value={dealInputs.depositsPerMonth} onChange={(e) => updateInput('depositsPerMonth', e.target.value)} placeholder="5" />)}
          {inputLabel('Credit Score (FICO)', <Input inputMode="numeric" value={dealInputs.fico} onChange={(e) => updateInput('fico', e.target.value)} placeholder="650" />)}
          <div className="flex items-end">
            <button className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted" type="button" onClick={() => setDealInputs(initialDealInputs)}>
              Reset inputs
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search funder, reason, states, positions, industry..." />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={fitFilter} onChange={(e) => setFitFilter(e.target.value as 'all' | RoutingFit)}>
            <option value="all">All fits</option>
            <option value="YES">GO fits</option>
            <option value="MAYBE">MAYBE / review</option>
            <option value="NO">NO fits</option>
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={submissionFilter} onChange={(e) => setSubmissionFilter(e.target.value as 'all' | SubmissionMethod)}>
            <option value="all">All submission methods</option>
            <option value="api">API</option>
            <option value="email">Email</option>
            <option value="portal">Portal</option>
            <option value="manual_portal">Manual Portal</option>
            <option value="tbd">TBD</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Showing {filteredResults.length} of {funders.length} funders. Expand any row for full guideline detail.</p>
      </Card>

      <Card className="overflow-x-auto rounded-xl border-border/80 p-0 shadow-sm">
        <table className="w-full min-w-[850px] table-fixed text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="w-[19%] px-3 py-2">Funder</th>
              <th className="w-[10%] px-3 py-2">Fit</th>
              <th className="w-[33%] px-3 py-2">Reason</th>
              <th className="w-[13%] px-3 py-2">Positions</th>
              <th className="w-[12%] px-3 py-2">Min revenue</th>
              <th className="w-[13%] px-3 py-2">Submission</th>
            </tr>
          </thead>
          {filteredResults.map(result => {
            const funder = funderById.get(result.funderId ?? '');
            if (!funder) return null;
            const isExpanded = expanded === funder.id;
            return (
              <tbody key={funder.id}>
                <tr className={`border-t border-border/80 ${rowClass[result.fit]}`}>
                  <td className="px-3 py-2"><button type="button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : funder.id)} className="block w-full truncate text-left font-medium underline-offset-2 hover:underline" title={result.funderName}>{result.funderName}</button></td>
                  <td className="px-3 py-2"><Badge className={fitClass[result.fit]}>{result.fit === 'YES' ? 'GO' : result.fit}</Badge></td>
                  <td className="px-3 py-2"><span className="block truncate" title={result.summary}>{result.summary}</span></td>
                  <td className="px-3 py-2"><span className="block truncate" title={plain(result.positions)}>{plain(result.positions)}</span></td>
                  <td className="px-3 py-2">{money(result.minRevenue)}</td>
                  <td className="px-3 py-2">{submissionMethodLabel(result.submissionMethod)}</td>
                </tr>
                {isExpanded && <tr><td colSpan={6}>
                      <div className="border-t border-border/80 bg-background/95 p-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                          <div>
                            <h4 className="font-semibold">Routing reason detail</h4>
                            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {result.reasons.map((reason, index) => (
                                <li key={`${reason.message}-${index}`}>
                                  <span className={reason.status === 'fail' ? 'font-medium text-red-700' : reason.status === 'warn' ? 'font-medium text-amber-700' : reason.status === 'pass' ? 'font-medium text-emerald-700' : 'font-medium'}>
                                    {reason.status.toUpperCase()}:
                                  </span>{' '}{reason.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-semibold">Full guideline detail</h4>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge>Submission method: {submissionMethodLabel(result.submissionMethod)}</Badge>
                              <Badge>Submission endpoint: {funder?.submission_endpoint || 'Not set'}</Badge>
                              {KEY_MATRIX_FIELDS.map((field) => {
                                const value = funder?.matrix_row[field];
                                if (!value || value === 'Unknown' || value === 'Not specified') return null;
                                return <Badge key={field}>{field}: {value}</Badge>;
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm">
                          <span>States {plain(result.states)}</span>
                          <span>Min FICO {result.minFico ?? '—'}</span>
                          <span>Min TIB {result.minTimeInBusinessMonths ?? '—'}</span>
                          <span>Max funding {money(result.maxFunding)}</span>
                          <Link href={{ pathname: '/admin/funders', query: { config: funder.id, dealId }, hash: 'submission-config' }} className="text-primary underline">Submission settings</Link>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          <div><h4 className="font-medium">Industry YES</h4><p className="text-sm text-muted-foreground">{funder?.industry_yes || '—'}</p></div>
                          <div><h4 className="font-medium">Industry MAYBE</h4><p className="text-sm text-muted-foreground">{funder?.industry_maybe || '—'}</p></div>
                          <div><h4 className="font-medium">Industry NO</h4><p className="text-sm text-muted-foreground">{funder?.industry_no || '—'}</p></div>
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div><h4 className="font-medium">Required docs</h4><p className="text-sm text-muted-foreground">{funder?.required_docs || '—'}</p></div>
                          <div><h4 className="font-medium">Notes / restrictions</h4><p className="text-sm text-muted-foreground">{funder?.notes || '—'}</p></div>
                        </div>
                      </div>
                </td></tr>}
              </tbody>
            );
          })}
        </table>
      </Card>
    </div>
  );
}
