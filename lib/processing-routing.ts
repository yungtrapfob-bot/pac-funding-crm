import { evaluateFunders, type FunderMasterRecord } from './funder-routing.ts';

type UnderwritingDeal = {
  monthly_revenue?: number | null; time_in_business_months?: number | null;
  fico?: number | null; positions?: number | null; nsf_count?: number | null;
  deposits?: number | null; state?: string | null; industry?: string | null;
  requested_amount?: number | null; internal_notes?: string | null; negative_days?: number | null; underwriting_reviewed?: boolean;
};

export function routingInputs(deal: UnderwritingDeal) {
  const positive = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const financial = (value?: number | null) => deal.underwriting_reviewed && value === 0 ? 0 : positive(value);
  const legacyRequest = deal.internal_notes?.match(/Requested funding amount:\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1];
  return {
    monthlyRevenue: financial(deal.monthly_revenue),
    timeInBusinessMonths: positive(deal.time_in_business_months),
    fico: positive(deal.fico),
    // The deal stores the number of existing positions. A new advance takes the next one.
    positions: typeof deal.positions === 'number' && Number.isInteger(deal.positions) && (deal.positions > 0 || Boolean(deal.underwriting_reviewed) && deal.positions === 0) ? deal.positions + 1 : null,
    nsfCount: financial(deal.nsf_count),
    depositsPerMonth: financial(deal.deposits),
    negativeDays: deal.negative_days ?? null,
    state: deal.state?.trim() || null,
    industry: deal.industry?.trim() || null,
    requestedAmount: financial(deal.requested_amount) ?? (!deal.underwriting_reviewed && legacyRequest ? positive(Number(legacyRequest.replace(/,/g, ''))) : null),
  };
}

export function evaluateProcessingFunders(funders: FunderMasterRecord[], deal: UnderwritingDeal) {
  return evaluateFunders(funders.filter(funder => funder.is_active !== false), routingInputs(deal));
}
