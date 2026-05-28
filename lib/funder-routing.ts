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
  if (dealPosition == null) return { status: 'unknown', message: 'Position not entered.' };
  if (!positions) return { status: 'unknown', message: 'Position guidance unavailable.' };

  const text = clean(positions);
  if (text.includes('any') || text.includes('no max')) return { status: 'pass', message: `Position ${positionLabel(dealPosition)} accepted.` };

  const exactPositions = Array.from(text.matchAll(/(\d+)(?:st|nd|rd|th)?/g)).map((match) => Number(match[1]));
  const hasPlus = /\d+\s*\+/.test(text) || text.includes('plus');
  if (hasPlus && exactPositions.length > 0) {
    const minPosition = Math.min(...exactPositions);
    return dealPosition >= minPosition
      ? { status: 'pass', message: `Position ${positionLabel(dealPosition)} fits ${positions}.` }
      : { status: 'fail', message: `Position too early; guide starts at ${positionLabel(minPosition)}.` };
  }

  if (exactPositions.length > 0) {
    return exactPositions.includes(dealPosition)
      ? { status: 'pass', message: `Position ${positionLabel(dealPosition)} is listed.` }
      : { status: 'fail', message: `Position ${positionLabel(dealPosition)} is not listed.` };
  }

  return { status: 'unknown', message: 'Position guidance ambiguous; manual review.' };
}

function stateDecision(dealState: string | null, states: string | null): Reason {
  const st = clean(dealState).toUpperCase();
  if (!st || !states) return { status: 'unknown', message: 'State comparison unavailable.' };
  const s = clean(states);
  if (s.includes('all 50') || s.includes('all states') || s.includes('not specified')) return { status: 'pass', message: `State allowed (${st}).` };
  if (s.includes('except')) {
    const blocked = (s.split('except')[1] || '').toUpperCase();
    if (blocked.split(/[^A-Z]/).includes(st)) return { status: 'fail', message: `State restricted (${st}).` };
    return { status: 'pass', message: `State appears allowed (${st}).` };
  }
  if (s.includes('restricted') && s.toUpperCase().split(/[^A-Z]/).includes(st)) return { status: 'fail', message: `State restricted (${st}).` };
  if (s.toUpperCase().split(/[^A-Z]/).includes(st)) return { status: 'pass', message: `State listed (${st}).` };
  return { status: 'warn', message: `State rule ambiguous for ${st}; manual review.` };
}

function conciseReason(reasons: Reason[]) {
  const hardFails = reasons.filter((r) => r.status === 'fail').map((r) => r.message);
  if (hardFails.length > 0) return hardFails.slice(0, 2).join(' ');
  const warnings = reasons.filter((r) => r.status === 'warn').map((r) => r.message);
  if (warnings.length > 0) return warnings.slice(0, 2).join(' ');
  const unknowns = reasons.filter((r) => r.status === 'unknown').map((r) => r.message);
  if (unknowns.length > 0) return `Eligible on known hard checks; ${unknowns.slice(0, 2).join(' ')}`;
  return 'All entered deal fields pass matrix guidelines.';
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
        ? { status: 'pass', message: `Revenue passes min ($${revenueMinimum.toLocaleString()}).` }
        : { status: 'fail', message: `Revenue below min ($${revenueMinimum.toLocaleString()}).` });
    } else reasons.push({ status: 'unknown', message: 'Revenue rule unavailable.' });

    if (deal.timeInBusinessMonths != null && f.min_time_in_business_months != null) {
      reasons.push(deal.timeInBusinessMonths >= f.min_time_in_business_months
        ? { status: 'pass', message: `TIB passes min (${f.min_time_in_business_months} mo).` }
        : { status: 'fail', message: `TIB below min (${f.min_time_in_business_months} mo).` });
    } else reasons.push({ status: 'unknown', message: 'Time-in-business rule unavailable.' });

    if (deal.fico != null && f.min_fico != null && f.min_fico > 0) {
      reasons.push(deal.fico >= f.min_fico
        ? { status: 'pass', message: `FICO passes min (${f.min_fico}).` }
        : { status: 'fail', message: `FICO below min (${f.min_fico}).` });
    } else reasons.push({ status: 'unknown', message: 'FICO rule unavailable or no minimum.' });

    const maxNsf = toNum(f.matrix_row['Max NSFs/Neg Days']);
    if (deal.nsfCount != null && maxNsf != null) {
      reasons.push(deal.nsfCount <= maxNsf ? { status: 'pass', message: `NSFs/neg days within max (${maxNsf}).` } : { status: 'fail', message: `NSFs/neg days above max (${maxNsf}).` });
    } else reasons.push({ status: 'unknown', message: 'NSF/negative-day guideline not explicit.' });

    const minDeposits = toNum(f.matrix_row['Min Deposits/Month']);
    if (deal.depositsPerMonth != null && minDeposits != null) {
      reasons.push(deal.depositsPerMonth >= minDeposits ? { status: 'pass', message: `Deposits pass min/month (${minDeposits}).` } : { status: 'fail', message: `Deposits below min/month (${minDeposits}).` });
    } else reasons.push({ status: 'unknown', message: 'Deposit/month rule unavailable.' });

    reasons.push(positionDecision(deal.positions, f.positions));
    reasons.push(stateDecision(deal.state, f.states));

    if (deal.industry) {
      if (normalizedIndustryMatch(deal.industry, f.industry_no)) reasons.push({ status: 'fail', message: 'Industry appears prohibited by matrix.' });
      else if (normalizedIndustryMatch(deal.industry, f.industry_yes)) reasons.push({ status: 'pass', message: 'Industry appears preferred/allowed.' });
      else if (normalizedIndustryMatch(deal.industry, f.industry_maybe)) reasons.push({ status: 'warn', message: 'Industry is conditional; manual review thresholds apply.' });
      else reasons.push({ status: 'warn', message: 'No explicit industry match; manual review.' });
    } else reasons.push({ status: 'unknown', message: 'Industry not entered.' });

    if (deal.requestedAmount != null && f.max_funding != null) {
      reasons.push(deal.requestedAmount <= f.max_funding ? { status: 'pass', message: `Requested amount within max funding ($${f.max_funding.toLocaleString()}).` } : { status: 'fail', message: `Requested amount above max funding ($${f.max_funding.toLocaleString()}).` });
    } else reasons.push({ status: 'unknown', message: 'Requested amount/max funding check unavailable.' });

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
      submissionMethod: f.submission_method,
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
