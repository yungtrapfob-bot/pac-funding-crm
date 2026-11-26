import { evaluateFunders, type FunderMasterRecord } from './funder-routing.ts';

type UnderwritingDeal = {
  monthly_revenue?: number | null; time_in_business_months?: number | null;
  fico?: number | null; positions?: number | null; nsf_count?: number | null;
  deposits?: number | null; state?: string | null; industry?: string | null;
  requested_amount?: number | null; internal_notes?: string | null;
};

export function routingInputs(deal: UnderwritingDeal) {
  const positive = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const legacyRequest = deal.internal_notes?.match(/Requested funding amount:\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1];
  return {
    monthlyRevenue: positive(deal.monthly_revenue),
    timeInBusinessMonths: positive(deal.time_in_business_months),
    fico: positive(deal.fico),
    // The deal stores the number of existing positions. A new advance takes the next one.
    positions: typeof deal.positions === 'number' && Number.isInteger(deal.positions) && deal.positions >= 0 ? deal.positions + 1 : null,
    nsfCount: typeof deal.nsf_count === 'number' && deal.nsf_count >= 0 ? deal.nsf_count : null,
    depositsPerMonth: positive(deal.deposits),
    state: deal.state?.trim() || null,
    industry: deal.industry?.trim() || null,
    requestedAmount: positive(deal.requested_amount) ?? (legacyRequest ? positive(Number(legacyRequest.replace(/,/g, ''))) : null),
  };
}

export function evaluateProcessingFunders(funders: FunderMasterRecord[], deal: UnderwritingDeal) {
  return evaluateFunders(funders.filter(funder => funder.is_active !== false), routingInputs(deal));
}
