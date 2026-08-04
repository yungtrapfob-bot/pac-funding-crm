export type SubmissionMethod = 'api' | 'email' | 'portal' | 'manual_portal' | 'tbd';
export type StoredSubmissionMethod = SubmissionMethod | 'unknown_tbd' | string | null | undefined;

type MatrixRow = Record<string, string>;

export type FunderMasterRecord = {
  id?: string;
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
  primary_submission_email?: string | null;
  submission_cc?: string | null;
  submission_bcc?: string | null;
  subject_template?: string | null;
  body_template?: string | null;
  required_document_types?: string[] | null;
  internal_submission_notes?: string | null;
  is_active?: boolean | null;
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

const clean = (value: string | null | undefined) => (value || '').trim().toLowerCase();

const isBlankRule = (value: string | null | undefined) => {
  const text = clean(value);
  return !text || ['not specified', 'none stated', 'none', 'unknown', 'n/a', 'na'].includes(text);
};

const extractNumbers = (value: string | null | undefined): number[] => {
  if (!value) return [];
  const matches = Array.from(value.replace(/,/g, '').matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/g));
  return matches.map((match) => {
    const base = Number(match[1]);
    const suffix = (match[2] || '').toLowerCase();
    if (suffix === 'k') return base * 1000;
    if (suffix === 'm') return base * 1000000;
    return base;
  }).filter((number) => Number.isFinite(number));
};

const minNumber = (v: string | null | undefined): number | null => extractNumbers(v)[0] ?? null;
const maxNumber = (v: string | null | undefined): number | null => {
  const numbers = extractNumbers(v);
  return numbers.length > 0 ? Math.max(...numbers) : null;
};

const splitTerms = (v: string | null | undefined) => clean(v)
  .split(/[;,]/)
  .map((s) => s.replace(/^preferred:\s*/i, '').replace(/^do not fund:\s*/i, '').trim())
  .filter(Boolean);

const INDUSTRY_ALIASES: Record<string, string[]> = {
  restaurant: ['restaurant', 'restaurants', 'restaurant & bars', 'food & beverage', 'hospitality'],
  restaurants: ['restaurant', 'restaurants', 'restaurant & bars', 'food & beverage', 'hospitality'],
  trucking: ['trucking', 'transportation', 'logistics', 'trucking & transportation'],
  construction: ['construction', 'general construction', 'contracting', 'contractor', 'specialty construction'],
  retail: ['retail', 'retail/wholesale', 'retail businesses', 'brick & mortar'],
  healthcare: ['healthcare', 'health care', 'medical', 'medical offices', 'health services'],
  medical: ['medical', 'medical offices', 'healthcare', 'health care', 'health services'],
  'auto repair': ['auto repair', 'automotive repair'],
  'auto sales': ['auto sales', 'auto dealers', 'automotive sales', 'motor vehicle sales', 'dealership']
};

function industryNeedles(industry: string) {
  const normalized = clean(industry);
  const aliases = INDUSTRY_ALIASES[normalized] || [];
  return Array.from(new Set([normalized, ...aliases].filter(Boolean)));
}

function textMentionsIndustry(industry: string, text: string | null | undefined) {
  const haystack = clean(text);
  if (!industry || !haystack) return false;
  return industryNeedles(industry).some((needle) => haystack.includes(needle) || needle.includes(haystack));
}

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
  if (!industry || isBlankRule(text)) return false;
  if (haystack.includes('all industries') || haystack.includes('no industry restrictions') || haystack.includes('minimal industry restrictions')) return true;
  return splitTerms(text).some((term) => textMentionsIndustry(industry, term));
}

function matchingConditionalClause(industry: string, text: string | null | undefined) {
  if (!industry || isBlankRule(text)) return null;
  return splitTerms(text).find((term) => textMentionsIndustry(industry, term)) || null;
}

function getIndustryMinimum(f: FunderMasterRecord, industry: string | null) {
  const baseMinimum = f.min_monthly_revenue;
  if (!industry) return baseMinimum;

  const conditionalClause = matchingConditionalClause(industry, f.industry_maybe);
  const conditionalRevenue = extractRevenueMinimum(conditionalClause);
  const truckingConstructionMinimum = minNumber(f.matrix_row['Min Monthly Rev (Trucking/Construction)']);
  const isTruckingConstruction = textMentionsIndustry('trucking', industry) || textMentionsIndustry('construction', industry);

  return [baseMinimum, conditionalRevenue, isTruckingConstruction ? truckingConstructionMinimum : null]
    .filter((value): value is number => value != null)
    .reduce<number | null>((highest, value) => highest == null ? value : Math.max(highest, value), null);
}

function extractRevenueMinimum(text: string | null | undefined) {
  const value = clean(text);
  if (!value || !/(rev|revenue|avg monthly|monthly|mo)/.test(value)) return null;
  return maxNumber(text);
}

function extractMonthsMinimum(text: string | null | undefined) {
  const value = clean(text);
  if (!value || !/(tib|time in biz|years?|yrs?|months?|mos?)/.test(value)) return null;
  const yearMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:yrs?|years?)/);
  if (yearMatch) return Math.round(Number(yearMatch[1]) * 12);
  const monthMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)/);
  if (monthMatch) return Math.round(Number(monthMatch[1]));
  return null;
}


function positionLabel(position: number) {
  const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
  return `${position}${suffix}`;
}

function extractPositionNumbers(text: string | null | undefined) {
  if (!text) return [];
  const positions = new Set<number>();
  const normalized = clean(text);
  for (const match of normalized.matchAll(/(\d+)(?:st|nd|rd|th)?\s*-\s*(\d+)(?:st|nd|rd|th)?/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    for (let position = Math.min(start, end); position <= Math.max(start, end); position += 1) positions.add(position);
  }
  for (const match of normalized.matchAll(/(\d+)(?:st|nd|rd|th)?/g)) positions.add(Number(match[1]));
  return Array.from(positions).filter((position) => Number.isFinite(position));
}

function positionDecision(dealPosition: number | null, positions: string | null): Reason {
  if (dealPosition == null) return { status: 'unknown', message: 'Position not provided.' };
  if (isBlankRule(positions)) return { status: 'unknown', message: 'No position rule stored.' };

  const text = clean(positions);
  if (text.includes('any') || text.includes('no max')) return { status: 'pass', message: `Position ${positionLabel(dealPosition)} accepted.` };

  const exactPositions = extractPositionNumbers(positions);
  const hasPlus = /\d+\s*\+|\b\d+\+|plus/.test(text);
  if (hasPlus && exactPositions.length > 0) {
    const minPosition = Math.min(...exactPositions);
    return dealPosition >= minPosition
      ? { status: 'pass', message: `Position ${positionLabel(dealPosition)} fits ${positionLabel(minPosition)}+ guide.` }
      : { status: 'fail', message: `Position ${positionLabel(dealPosition)} too early; starts at ${positionLabel(minPosition)}.` };
  }

  if (exactPositions.includes(dealPosition)) {
    if (/case-by-case|case by case|c\/b|review/.test(text) && text.includes(positionLabel(dealPosition))) {
      return { status: 'warn', message: `Position ${positionLabel(dealPosition)} is case-by-case.` };
    }
    return { status: 'pass', message: `Position ${positionLabel(dealPosition)} listed.` };
  }

  return exactPositions.length > 0
    ? { status: 'fail', message: `Position ${positionLabel(dealPosition)} not accepted.` }
    : { status: 'unknown', message: 'Position rule needs review.' };
}

function stateTokens(text: string) {
  return text.toUpperCase().split(/[^A-Z]/).filter((token) => token.length === 2);
}

function stateDecision(dealState: string | null, states: string | null): Reason {
  const st = clean(dealState).toUpperCase();
  if (!st) return { status: 'unknown', message: 'State not provided.' };
  if (isBlankRule(states)) return { status: 'pass', message: `State ${st} has no matrix restriction.` };

  const s = clean(states);
  const tokens = stateTokens(states || '');
  const hasState = tokens.includes(st);
  if (s.includes('all 50') || s.includes('all states') || s.includes('all 50 states')) {
    if (/except|not available|restricted/.test(s) && hasState) return { status: 'warn', message: `State ${st} has product/state nuance.` };
    return { status: 'pass', message: `State ${st} allowed.` };
  }
  if (s.includes('except') || s.includes('restricted') || s.includes('not available')) {
    return hasState
      ? { status: 'fail', message: `State ${st} restricted.` }
      : { status: 'pass', message: `State ${st} not restricted.` };
  }
  if (hasState) return { status: 'pass', message: `State ${st} listed.` };
  return { status: 'warn', message: `State ${st} needs manual review.` };
}

function numericDecision(label: string, dealValue: number | null, ruleValue: number | null, passMessage: (value: number) => string, failMessage: (value: number) => string, noRuleMessage: string, compare: (deal: number, rule: number) => boolean): Reason {
  if (dealValue == null) return { status: 'unknown', message: `${label} not provided.` };
  if (ruleValue == null) return { status: 'pass', message: noRuleMessage };
  return compare(dealValue, ruleValue)
    ? { status: 'pass', message: passMessage(ruleValue) }
    : { status: 'fail', message: failMessage(ruleValue) };
}

function maxNsfRule(value: string | null | undefined) {
  const text = clean(value);
  if (isBlankRule(value) || text.includes('unknown')) return null;
  if (text.includes('no minimum')) return null;
  const smallNumbers = extractNumbers(value).filter((number) => number >= 0 && number <= 31);
  if (smallNumbers.length === 0) return null;
  if (/</.test(text)) return Math.max(...smallNumbers.map((number) => Math.max(0, number - 1)));
  return Math.max(...smallNumbers);
}

function minDepositRule(value: string | null | undefined, industry: string | null) {
  const text = clean(value);
  if (text.includes('no minimum')) return 0;
  if (isBlankRule(value) || text.includes('unknown')) return null;
  const constructionMatch = text.match(/(\d+)\s*(?:for|construction)/);
  if (industry && textMentionsIndustry('construction', industry) && constructionMatch) return Number(constructionMatch[1]);
  return minNumber(value);
}

function ficoRule(f: FunderMasterRecord, industry: string | null, position: number | null) {
  const raw = f.matrix_row['Min FICO'];
  const text = clean(raw);
  if (text.includes('no minimum') || text.includes('no fico') || text.includes('no credit score')) return null;
  if (industry && textMentionsIndustry('construction', industry) && position === 2 && text.includes('construction 2nd')) return 650;
  if (industry && textMentionsIndustry('construction', industry) && position === 1 && text.includes('construction 1st')) return 600;
  if (industry && textMentionsIndustry('trucking', industry) && text.includes('trucking')) return 620;
  return f.min_fico && f.min_fico > 0 ? f.min_fico : minNumber(raw);
}

function timeInBusinessRule(f: FunderMasterRecord, industry: string | null) {
  const raw = f.matrix_row['Min Time in Biz (Months)'];
  const conditional = industry ? matchingConditionalClause(industry, f.industry_maybe) : null;
  const conditionalMonths = extractMonthsMinimum(conditional);
  const base = f.min_time_in_business_months ?? extractMonthsMinimum(raw) ?? minNumber(raw);
  if (conditionalMonths != null && base != null) return Math.max(base, conditionalMonths);
  return conditionalMonths ?? base;
}

function maxFundingRule(f: FunderMasterRecord, position: number | null) {
  const raw = f.matrix_row['Max Funding'];
  const text = clean(raw);
  if (position != null) {
    const escapedPosition = positionLabel(position).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escapedPosition}[^$\\d]*(?:\\$?\\s*)?(\\d+(?:\\.\\d+)?)([km])?`));
    if (match) {
      const suffix = match[2] || '';
      const amount = Number(match[1]) * (suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1);
      if (Number.isFinite(amount)) return amount;
    }
  }
  return f.max_funding ?? maxNumber(raw);
}

function industryDecision(f: FunderMasterRecord, deal: DealRoutingInput): Reason {
  if (!deal.industry) return { status: 'unknown', message: 'Industry not provided.' };
  if (normalizedIndustryMatch(deal.industry, f.industry_no)) return { status: 'fail', message: 'Industry is prohibited by matrix.' };

  const conditionalClause = matchingConditionalClause(deal.industry, f.industry_maybe);
  if (conditionalClause) {
    const checks: Reason[] = [];
    const revenueMinimum = extractRevenueMinimum(conditionalClause);
    const tibMinimum = extractMonthsMinimum(conditionalClause);
    if (revenueMinimum != null) checks.push(numericDecision('Revenue', deal.monthlyRevenue, revenueMinimum, (value) => `conditional revenue clears $${value.toLocaleString()}`, (value) => `conditional revenue below $${value.toLocaleString()}`, 'conditional revenue not specified', (dealValue, ruleValue) => dealValue >= ruleValue));
    if (tibMinimum != null) checks.push(numericDecision('TIB', deal.timeInBusinessMonths, tibMinimum, (value) => `conditional TIB clears ${value} mo`, (value) => `conditional TIB below ${value} mo`, 'conditional TIB not specified', (dealValue, ruleValue) => dealValue >= ruleValue));

    const fail = checks.find((check) => check.status === 'fail' || check.status === 'unknown');
    if (fail) return { status: fail.status, message: `Industry conditional: ${fail.message}.` };
    if (checks.length > 0) return { status: 'pass', message: `Industry conditional met (${conditionalClause}).` };
    return { status: 'warn', message: `Industry conditional/manual review: ${conditionalClause}.` };
  }

  if (normalizedIndustryMatch(deal.industry, f.industry_yes)) return { status: 'pass', message: 'Industry accepted by matrix.' };
  if (isBlankRule(f.industry_yes) || clean(f.industry_yes).includes('minimal industry restrictions') || clean(f.industry_yes).includes('general industries')) {
    return { status: 'pass', message: 'Industry has no matrix restriction.' };
  }
  return { status: 'pass', message: 'Industry not restricted by matrix.' };
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
    const tibMinimum = timeInBusinessRule(f, deal.industry);
    const minFico = ficoRule(f, deal.industry, deal.positions);
    const maxNsf = maxNsfRule(f.matrix_row['Max NSFs/Neg Days']);
    const minDeposits = minDepositRule(f.matrix_row['Min Deposits/Month'], deal.industry);
    const maxFunding = maxFundingRule(f, deal.positions);

    reasons.push(numericDecision(
      'Revenue',
      deal.monthlyRevenue,
      revenueMinimum,
      (value) => `Revenue clears $${value.toLocaleString()} min.`,
      (value) => `Revenue below $${value.toLocaleString()} min.`,
      'No revenue minimum in matrix.',
      (dealValue, ruleValue) => dealValue >= ruleValue
    ));

    reasons.push(numericDecision(
      'TIB',
      deal.timeInBusinessMonths,
      tibMinimum,
      (value) => `TIB clears ${value} mo min.`,
      (value) => `TIB below ${value} mo min.`,
      'No TIB minimum in matrix.',
      (dealValue, ruleValue) => dealValue >= ruleValue
    ));

    reasons.push(numericDecision(
      'FICO',
      deal.fico,
      minFico,
      (value) => `FICO clears ${value} min.`,
      (value) => `FICO below ${value} min.`,
      'No FICO minimum in matrix.',
      (dealValue, ruleValue) => dealValue >= ruleValue
    ));

    reasons.push(numericDecision(
      'NSF',
      deal.nsfCount,
      maxNsf,
      (value) => `NSFs within ${value} max.`,
      (value) => `NSFs exceed ${value} max.`,
      'No NSF/negative-day cap in matrix.',
      (dealValue, ruleValue) => dealValue <= ruleValue
    ));

    reasons.push(numericDecision(
      'Deposits',
      deal.depositsPerMonth,
      minDeposits,
      (value) => `Deposits clear ${value}/mo min.`,
      (value) => `Deposits below ${value}/mo min.`,
      'No deposit-count minimum in matrix.',
      (dealValue, ruleValue) => dealValue >= ruleValue
    ));

    reasons.push(positionDecision(deal.positions, f.positions));
    reasons.push(stateDecision(deal.state, f.states));
    reasons.push(industryDecision(f, deal));

    reasons.push(numericDecision(
      'Funding request',
      deal.requestedAmount,
      maxFunding,
      (value) => `Request within $${value.toLocaleString()} max.`,
      (value) => `Request above $${value.toLocaleString()} max.`,
      'No funding cap in matrix.',
      (dealValue, ruleValue) => dealValue <= ruleValue
    ));

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
