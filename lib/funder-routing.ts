export type SubmissionMethod = 'api' | 'email' | 'portal' | 'manual_portal' | 'tbd';
export type StoredSubmissionMethod = SubmissionMethod | 'unknown_tbd' | string | null | undefined;

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
  submission_method: StoredSubmissionMethod;
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

export type Reason = { status: 'pass' | 'warn' | 'fail' | 'unknown'; message: string };

export type RoutingFit = 'YES' | 'MAYBE' | 'NO';

export type RoutingResult = {
  funderName: string;
  result: 'recommended' | 'possible' | 'declined';
  fit: RoutingFit;
  summary: string;
  reasons: Reason[];
  score: number;
  scoreLabel: string;
  submissionMethod: SubmissionMethod;
  positions: string | null;
  states: string | null;
  maxFunding: number | null;
  minRevenue: number | null;
  minTimeInBusinessMonths: number | null;
  minFico: number | null;
  industrySummary: string;
};

const toNum = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const m = v.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const clean = (value: string | null | undefined) => (value || '').trim().toLowerCase();
const splitTerms = (v: string | null | undefined) => clean(v).split(/[;,/]/).map((s) => s.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);

export function normalizeSubmissionMethod(value: StoredSubmissionMethod): SubmissionMethod {
  const method = clean(String(value || '')).replace(/[\s-]+/g, '_');
  if (method === 'api') return 'api';
  if (method === 'email') return 'email';
  if (method === 'portal') return 'portal';
  if (method === 'manual_portal' || method === 'manual') return 'manual_portal';
  return 'tbd';
}

export function submissionMethodLabel(value: StoredSubmissionMethod) {
  const method = normalizeSubmissionMethod(value);
  const labels: Record<SubmissionMethod, string> = {
    api: 'API',
    email: 'Email',
    portal: 'Portal',
    manual_portal: 'Manual Portal',
    tbd: 'TBD'
  };
  return labels[method];
}

export function inferSubmissionMethodFromText(...values: Array<string | null | undefined>): SubmissionMethod {
  const text = clean(values.filter(Boolean).join(' '));
  if (!text) return 'tbd';
  if (/\bapi\b|webhook|integration/.test(text)) return 'api';
  if (/\bportal\b|login|upload/.test(text)) return 'portal';
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) || /\bemail\b|submissions?@|deals?@/.test(text)) return 'email';
  return 'tbd';
}

function normalizedIndustryMatch(industry: string, text: string | null | undefined) {
  const haystack = clean(text);
  if (!industry || !haystack || haystack === 'not specified' || haystack === 'none stated') return false;
  if (haystack.includes('all industries')) return true;
  const needle = clean(industry);
  return splitTerms(text).some((term) => term && (needle.includes(term) || term.includes(needle)));
}

function getIndustryMinimum(f: FunderMasterRecord, industry: string | null) {
  const baseMinimum = f.min_monthly_revenue;
  if (!industry) return baseMinimum;
  const industryText = clean(industry);
  const truckingConstructionMinimum = toNum(f.matrix_row['Min Monthly Rev (Trucking/Construction)']);
  const isTruckingConstruction = industryText.includes('trucking') || industryText.includes('construction');
  if (isTruckingConstruction && truckingConstructionMinimum != null) return Math.max(baseMinimum ?? 0, truckingConstructionMinimum);
  return baseMinimum;
}

function positionLabel(position: number) {
  const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
  return `${position}${suffix}`;
}

function positionDecision(dealPosition: number | null, positions: string | null): Reason {
  if (dealPosition == null) return { status: 'unknown', message: 'Position not provided.' };
  if (!positions) return { status: 'unknown', message: 'No position rule stored.' };

  const text = clean(positions);
  if (text.includes('any') || text.includes('no max')) return { status: 'pass', message: `Position ${positionLabel(dealPosition)} accepted.` };

  const exactPositions = Array.from(text.matchAll(/(\d+)(?:st|nd|rd|th)?/g)).map((match) => Number(match[1]));
  const hasPlus = /\d+\s*\+/.test(text) || text.includes('plus');
  if (hasPlus && exactPositions.length > 0) {
    const minPosition = Math.min(...exactPositions);
    return dealPosition >= minPosition
      ? { status: 'pass', message: `Position ${positionLabel(dealPosition)} fits position guide.` }
      : { status: 'fail', message: `Position ${positionLabel(dealPosition)} too early; starts at ${positionLabel(minPosition)}.` };
  }

  if (exactPositions.length > 0) {
    return exactPositions.includes(dealPosition)
      ? { status: 'pass', message: `Position ${positionLabel(dealPosition)} listed.` }
      : { status: 'fail', message: `Position ${positionLabel(dealPosition)} not accepted.` };
  }

  return { status: 'unknown', message: 'Position rule needs review.' };
}

function stateDecision(dealState: string | null, states: string | null): Reason {
  const st = clean(dealState).toUpperCase();
  if (!st) return { status: 'unknown', message: 'State not provided.' };
  if (!states) return { status: 'unknown', message: 'No state rule stored.' };
  const s = clean(states);
  if (s.includes('all 50') || s.includes('all states') || s.includes('not specified')) return { status: 'pass', message: `State ${st} allowed.` };
  if (s.includes('except')) {
    const blocked = (s.split('except')[1] || '').toUpperCase();
    if (blocked.split(/[^A-Z]/).includes(st)) return { status: 'fail', message: `State ${st} restricted.` };
    return { status: 'pass', message: `State ${st} not excluded.` };
  }
  if (s.includes('restricted') && s.toUpperCase().split(/[^A-Z]/).includes(st)) return { status: 'fail', message: `State ${st} restricted.` };
  if (s.toUpperCase().split(/[^A-Z]/).includes(st)) return { status: 'pass', message: `State ${st} listed.` };
  return { status: 'warn', message: `State ${st} needs manual review.` };
}

function conciseReason(reasons: Reason[]) {
  const hardFails = reasons.filter((r) => r.status === 'fail').map((r) => r.message);
  if (hardFails.length > 0) return `Decline: ${hardFails.slice(0, 2).join(' ')}`;
  const warnings = reasons.filter((r) => r.status === 'warn').map((r) => r.message);
  if (warnings.length > 0) return `Review: ${warnings.slice(0, 2).join(' ')}`;
  const unknowns = reasons.filter((r) => r.status === 'unknown').map((r) => r.message);
  if (unknowns.length > 0) return `Submit if docs confirm: ${unknowns.slice(0, 2).join(' ')}`;
  return 'Submit: entered fields clear stored guidelines.';
}

function industrySummary(f: FunderMasterRecord) {
  const yes = f.industry_yes && !['not specified', 'none stated'].includes(clean(f.industry_yes)) ? 'YES listed' : 'YES not specified';
  const maybe = f.industry_maybe && !['not specified', 'none stated'].includes(clean(f.industry_maybe)) ? 'MAYBE listed' : 'MAYBE not specified';
  const no = f.industry_no && !['not specified', 'none stated'].includes(clean(f.industry_no)) ? 'NO listed' : 'NO not specified';
  return `${yes} / ${maybe} / ${no}`;
}

export function evaluateFunders(funders: FunderMasterRecord[], deal: DealRoutingInput): RoutingResult[] {
  const sortRank: Record<RoutingFit, number> = { YES: 0, MAYBE: 1, NO: 2 };

  return funders.map((f) => {
    const reasons: Reason[] = [];
    const revenueMinimum = getIndustryMinimum(f, deal.industry);

    if (deal.monthlyRevenue != null && revenueMinimum != null) {
      reasons.push(deal.monthlyRevenue >= revenueMinimum
        ? { status: 'pass', message: `Revenue clears $${revenueMinimum.toLocaleString()} min.` }
        : { status: 'fail', message: `Revenue below $${revenueMinimum.toLocaleString()} min.` });
    } else reasons.push({ status: 'unknown', message: 'Revenue check unavailable.' });

    if (deal.timeInBusinessMonths != null && f.min_time_in_business_months != null) {
      reasons.push(deal.timeInBusinessMonths >= f.min_time_in_business_months
        ? { status: 'pass', message: `TIB clears ${f.min_time_in_business_months} mo min.` }
        : { status: 'fail', message: `TIB below ${f.min_time_in_business_months} mo min.` });
    } else reasons.push({ status: 'unknown', message: 'TIB check unavailable.' });

    if (deal.fico != null && f.min_fico != null && f.min_fico > 0) {
      reasons.push(deal.fico >= f.min_fico
        ? { status: 'pass', message: `FICO clears ${f.min_fico} min.` }
        : { status: 'fail', message: `FICO below ${f.min_fico} min.` });
    } else reasons.push({ status: 'unknown', message: 'FICO check unavailable.' });

    const maxNsf = toNum(f.matrix_row['Max NSFs/Neg Days']);
    if (deal.nsfCount != null && maxNsf != null) {
      reasons.push(deal.nsfCount <= maxNsf ? { status: 'pass', message: `NSFs within ${maxNsf} max.` } : { status: 'fail', message: `NSFs exceed ${maxNsf} max.` });
    } else reasons.push({ status: 'unknown', message: 'NSF guideline not explicit.' });

    const minDeposits = toNum(f.matrix_row['Min Deposits/Month']);
    if (deal.depositsPerMonth != null && minDeposits != null) {
      reasons.push(deal.depositsPerMonth >= minDeposits ? { status: 'pass', message: `Deposits clear ${minDeposits}/mo min.` } : { status: 'fail', message: `Deposits below ${minDeposits}/mo min.` });
    } else reasons.push({ status: 'unknown', message: 'Deposit check unavailable.' });

    reasons.push(positionDecision(deal.positions, f.positions));
    reasons.push(stateDecision(deal.state, f.states));

    if (deal.industry) {
      if (normalizedIndustryMatch(deal.industry, f.industry_no)) reasons.push({ status: 'fail', message: 'Industry is prohibited.' });
      else if (normalizedIndustryMatch(deal.industry, f.industry_yes)) reasons.push({ status: 'pass', message: 'Industry accepted.' });
      else if (normalizedIndustryMatch(deal.industry, f.industry_maybe)) reasons.push({ status: 'warn', message: 'Industry is conditional.' });
      else reasons.push({ status: 'warn', message: 'Industry not explicitly listed.' });
    } else reasons.push({ status: 'unknown', message: 'Industry not provided.' });

    if (deal.requestedAmount != null && f.max_funding != null) {
      reasons.push(deal.requestedAmount <= f.max_funding ? { status: 'pass', message: `Request within $${f.max_funding.toLocaleString()} max.` } : { status: 'fail', message: `Request above $${f.max_funding.toLocaleString()} max.` });
    } else reasons.push({ status: 'unknown', message: 'Funding cap check unavailable.' });

    const fails = reasons.filter((r) => r.status === 'fail').length;
    const warns = reasons.filter((r) => r.status === 'warn').length;
    const passes = reasons.filter((r) => r.status === 'pass').length;
    const knownChecks = reasons.filter((r) => r.status !== 'unknown').length;
    const fit: RoutingFit = fails > 0 ? 'NO' : warns > 0 ? 'MAYBE' : 'YES';
    const result: RoutingResult['result'] = fit === 'NO' ? 'declined' : fit === 'MAYBE' ? 'possible' : 'recommended';
    const score = knownChecks === 0 ? 0 : Math.round((passes / knownChecks) * 100);

    return {
      funderName: f.funder_name,
      result,
      fit,
      summary: conciseReason(reasons),
      reasons,
      score,
      scoreLabel: `${passes}/${knownChecks} checks`,
      submissionMethod: normalizeSubmissionMethod(f.submission_method),
      positions: f.positions,
      states: f.states,
      maxFunding: f.max_funding,
      minRevenue: revenueMinimum,
      minTimeInBusinessMonths: f.min_time_in_business_months,
      minFico: f.min_fico,
      industrySummary: industrySummary(f)
    };
  }).sort((a, b) => sortRank[a.fit] - sortRank[b.fit] || b.score - a.score || a.funderName.localeCompare(b.funderName));
}
