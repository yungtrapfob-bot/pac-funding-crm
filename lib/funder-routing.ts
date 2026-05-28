export type SubmissionMethod = 'api' | 'email' | 'portal' | 'unknown_tbd';

type MatrixRow = Record<string, string>;

export type FunderMasterRecord = {
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
  matrix_row: MatrixRow;
};

export type DealRoutingInput = {
  monthlyRevenue: number | null;
  timeInBusinessMonths: number | null;
  fico: number | null;
  positions: number | null;
  nsfCount: number | null;
  depositsPerMonth: number | null;
  state: string | null;
  industry: string | null;
  requestedAmount: number | null;
};

type Reason = { status: 'pass' | 'warn' | 'fail' | 'unknown'; message: string };

export type RoutingResult = {
  funderName: string;
  result: 'recommended' | 'possible' | 'declined';
  summary: string;
  reasons: Reason[];
  submissionMethod: SubmissionMethod;
  positions: string | null;
  maxFunding: number | null;
  minRevenue: number | null;
  minFico: number | null;
};

const toNum = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const m = v.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const splitTerms = (v: string | null | undefined) => (v || '').toLowerCase().split(/[;,/]/).map((s) => s.trim()).filter(Boolean);

function includesIndustry(industry: string, text: string | null | undefined) {
  if (!text) return false;
  return splitTerms(text).some((term) => term && industry.includes(term));
}

function parseMaxPosition(text: string | null): number | null {
  const nums = (text || '').match(/\d+/g);
  if (!nums?.length) return null;
  return Math.max(...nums.map(Number));
}

function stateDecision(dealState: string | null, states: string | null): Reason {
  if (!dealState || !states) return { status: 'unknown', message: 'State comparison unavailable.' };
  const s = states.toLowerCase();
  const st = dealState.toLowerCase();
  if (s.includes('all 50') || s.includes('all states') || s.includes('not specified') || s.includes('all 50 states')) return { status: 'pass', message: `State allowed (${dealState}).` };
  if (s.includes('except')) {
    const blocked = s.split('except')[1] || '';
    if (blocked.includes(st)) return { status: 'fail', message: `State restricted (${dealState}).` };
    return { status: 'pass', message: `State appears allowed (${dealState}).` };
  }
  if (s.includes('restricted') && s.includes(st)) return { status: 'fail', message: `State restricted (${dealState}).` };
  if (s.includes(st)) return { status: 'pass', message: `State listed (${dealState}).` };
  return { status: 'warn', message: `State rule ambiguous for ${dealState}; manual review.` };
}

export function evaluateFunders(funders: FunderMasterRecord[], deal: DealRoutingInput): RoutingResult[] {
  return funders.map((f) => {
    const reasons: Reason[] = [];

    if (deal.monthlyRevenue != null && f.min_monthly_revenue != null) {
      reasons.push(deal.monthlyRevenue >= f.min_monthly_revenue
        ? { status: 'pass', message: `Passes min revenue ($${f.min_monthly_revenue.toLocaleString()}).` }
        : { status: 'fail', message: `Fails min revenue ($${f.min_monthly_revenue.toLocaleString()}).` });
    } else reasons.push({ status: 'unknown', message: 'Revenue rule unavailable.' });

    if (deal.timeInBusinessMonths != null && f.min_time_in_business_months != null) {
      reasons.push(deal.timeInBusinessMonths >= f.min_time_in_business_months
        ? { status: 'pass', message: `Passes min TIB (${f.min_time_in_business_months} mo).` }
        : { status: 'fail', message: `Below min TIB (${f.min_time_in_business_months} mo).` });
    } else reasons.push({ status: 'unknown', message: 'Time-in-business rule unavailable.' });

    if (deal.fico != null && f.min_fico != null && f.min_fico > 0) {
      reasons.push(deal.fico >= f.min_fico
        ? { status: 'pass', message: `Passes min FICO (${f.min_fico}).` }
        : { status: 'fail', message: `Fails min FICO (${f.min_fico}).` });
    } else reasons.push({ status: 'unknown', message: 'FICO rule unavailable or no minimum.' });

    const maxNsf = toNum(f.matrix_row['Max NSFs/Neg Days']);
    if (deal.nsfCount != null && maxNsf != null) {
      reasons.push(deal.nsfCount <= maxNsf ? { status: 'pass', message: `NSF within max (${maxNsf}).` } : { status: 'fail', message: `NSF above max (${maxNsf}).` });
    } else reasons.push({ status: 'unknown', message: 'NSF guideline not explicit.' });

    const minDeposits = toNum(f.matrix_row['Min Deposits/Month']);
    if (deal.depositsPerMonth != null && minDeposits != null) {
      reasons.push(deal.depositsPerMonth >= minDeposits ? { status: 'pass', message: `Passes min deposits/month (${minDeposits}).` } : { status: 'fail', message: `Below min deposits/month (${minDeposits}).` });
    } else reasons.push({ status: 'unknown', message: 'Deposit/month rule unavailable.' });

    if (deal.positions != null) {
      const maxPos = parseMaxPosition(f.positions);
      reasons.push(maxPos == null ? { status: 'unknown', message: 'Position guidance ambiguous; manual review.' } : deal.positions <= maxPos ? { status: 'pass', message: `Position fit (needs ${deal.positions}, guide up to ${maxPos}).` } : { status: 'fail', message: `Position too deep (needs ${deal.positions}, guide up to ${maxPos}).` });
    }

    reasons.push(stateDecision(deal.state, f.states));

    if (deal.industry) {
      const industry = deal.industry.toLowerCase();
      if (includesIndustry(industry, f.industry_no)) reasons.push({ status: 'fail', message: 'Industry appears prohibited by matrix.' });
      else if (includesIndustry(industry, f.industry_yes)) reasons.push({ status: 'pass', message: 'Industry appears preferred/allowed.' });
      else if (includesIndustry(industry, f.industry_maybe)) reasons.push({ status: 'warn', message: 'Industry is conditional; manual review thresholds apply.' });
      else reasons.push({ status: 'warn', message: 'No explicit industry match in matrix; manual review.' });
    }

    if (deal.requestedAmount != null && f.max_funding != null) {
      reasons.push(deal.requestedAmount <= f.max_funding ? { status: 'pass', message: `Requested amount within max funding ($${f.max_funding.toLocaleString()}).` } : { status: 'fail', message: `Requested amount above max funding ($${f.max_funding.toLocaleString()}).` });
    }

    const fails = reasons.filter((r) => r.status === 'fail').length;
    const warns = reasons.filter((r) => r.status === 'warn').length;
    const result: RoutingResult['result'] = fails > 0 ? 'declined' : warns > 0 ? 'possible' : 'recommended';

    return {
      funderName: f.funder_name,
      result,
      summary: fails > 0 ? `${fails} hard fail checks.` : warns > 0 ? `${warns} conditional checks.` : 'All evaluated checks passed.',
      reasons,
      submissionMethod: f.submission_method,
      positions: f.positions,
      maxFunding: f.max_funding,
      minRevenue: f.min_monthly_revenue,
      minFico: f.min_fico
    };
  }).sort((a, b) => a.result.localeCompare(b.result) || a.funderName.localeCompare(b.funderName));
}
