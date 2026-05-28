'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type SubmissionMethod = 'api' | 'email' | 'portal' | 'unknown_tbd';

type Funder = {
  funder_name: string;
  positions: string | null;
  states: string | null;
  min_monthly_revenue: number | null;
  min_time_in_business_months: number | null;
  min_fico: number | null;
  max_funding: number | null;
  payment_frequency: string | null;
  required_docs: string | null;
  industry_yes: string | null;
  industry_maybe: string | null;
  industry_no: string | null;
  notes: string | null;
  submission_method: SubmissionMethod;
  submission_endpoint: string | null;
  matrix_row: Record<string, string>;
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

export function FunderMasterTable({ funders }: { funders: Funder[] }) {
  const [search, setSearch] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | SubmissionMethod>('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [industryModeFilter, setIndustryModeFilter] = useState<'all' | 'has_yes' | 'has_maybe' | 'has_no'>('all');

  const positionOptions = useMemo(() => {
    const bucket = new Set<string>();
    for (const funder of funders) {
      const text = (funder.positions || '').toLowerCase();
      for (const key of ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']) {
        if (text.includes(key)) bucket.add(key);
      }
    }
    return Array.from(bucket.values());
  }, [funders]);

  const filteredFunders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return funders.filter((f) => {
      const searchable = [f.funder_name, f.positions, f.states, f.notes, f.industry_yes, f.industry_maybe, f.industry_no].join(' ').toLowerCase();
      const matchesSearch = query.length === 0 || searchable.includes(query);
      const matchesSubmission = submissionFilter === 'all' || f.submission_method === submissionFilter;
      const matchesPosition = positionFilter === 'all' || (f.positions || '').toLowerCase().includes(positionFilter);
      const matchesIndustryMode = industryModeFilter === 'all' ||
        (industryModeFilter === 'has_yes' && !!f.industry_yes) ||
        (industryModeFilter === 'has_maybe' && !!f.industry_maybe) ||
        (industryModeFilter === 'has_no' && !!f.industry_no);
      return matchesSearch && matchesSubmission && matchesPosition && matchesIndustryMode;
    });
  }, [funders, industryModeFilter, positionFilter, search, submissionFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search funder, states, positions, notes, industry..." />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={submissionFilter} onChange={(e) => setSubmissionFilter(e.target.value as 'all' | SubmissionMethod)}>
            <option value="all">All submission methods</option>
            <option value="api">API</option>
            <option value="email">Email</option>
            <option value="portal">Portal</option>
            <option value="unknown_tbd">Unknown</option>
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="all">All positions</option>
            {positionOptions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={industryModeFilter} onChange={(e) => setIndustryModeFilter(e.target.value as 'all' | 'has_yes' | 'has_maybe' | 'has_no')}>
            <option value="all">All industry categories</option>
            <option value="has_yes">Has YES guidance</option>
            <option value="has_maybe">Has MAYBE guidance</option>
            <option value="has_no">Has NO guidance</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Showing {filteredFunders.length} of {funders.length} funders.</p>
      </Card>

      <Card className="overflow-x-auto rounded-xl border-border/80 p-0 shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/35 text-left">
            <tr>
              <th className="p-3">Funder</th><th className="p-3">Submission</th><th className="p-3">Positions</th><th className="p-3">States</th><th className="p-3">Min Rev</th><th className="p-3">Min TIB</th><th className="p-3">Min FICO</th><th className="p-3">Max Funding</th><th className="p-3">Payment</th>
            </tr>
          </thead>
          <tbody>
            {filteredFunders.map((funder) => (
              <tr key={funder.funder_name} className="border-t border-border/80 align-top">
                <td colSpan={9} className="p-0">
                  <details className="group">
                    <summary className="grid cursor-pointer grid-cols-9 gap-0 p-3 hover:bg-muted/20">
                      <span className="font-medium">{funder.funder_name}</span>
                      <span className="uppercase">{funder.submission_method.replace('_tbd', '')}</span>
                      <span>{funder.positions || '—'}</span>
                      <span>{funder.states || '—'}</span>
                      <span>{funder.min_monthly_revenue ? `$${Number(funder.min_monthly_revenue).toLocaleString()}` : '—'}</span>
                      <span>{funder.min_time_in_business_months ?? '—'} {funder.min_time_in_business_months ? 'mo' : ''}</span>
                      <span>{funder.min_fico ?? '—'}</span>
                      <span>{funder.max_funding ? `$${Number(funder.max_funding).toLocaleString()}` : '—'}</span>
                      <span>{funder.payment_frequency || '—'}</span>
                    </summary>
                    <div className="border-t bg-muted/10 p-4">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge>Submission endpoint: {funder.submission_endpoint || 'Not set'}</Badge>
                        {KEY_MATRIX_FIELDS.map((field) => {
                          const value = funder.matrix_row[field];
                          if (!value || value === 'Unknown' || value === 'Not specified') return null;
                          return <Badge key={field}>{field}: {value}</Badge>;
                        })}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        <div><h4 className="font-medium">Industry YES</h4><p className="text-sm text-muted-foreground">{funder.industry_yes || '—'}</p></div>
                        <div><h4 className="font-medium">Industry MAYBE</h4><p className="text-sm text-muted-foreground">{funder.industry_maybe || '—'}</p></div>
                        <div><h4 className="font-medium">Industry NO</h4><p className="text-sm text-muted-foreground">{funder.industry_no || '—'}</p></div>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div><h4 className="font-medium">Required docs</h4><p className="text-sm text-muted-foreground">{funder.required_docs || '—'}</p></div>
                        <div><h4 className="font-medium">Notes / restrictions</h4><p className="text-sm text-muted-foreground">{funder.notes || '—'}</p></div>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
