import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateProcessingFunders } from '../lib/processing-routing.ts';

const funder = {
  id: 'funder', funder_name: 'Synthetic Funder', is_active: true, positions: '1st 2nd',
  states: 'All 50 except TX', min_monthly_revenue: 10000, min_time_in_business_months: 6,
  min_fico: 500, max_funding: 100000, industry_yes: 'Retail', industry_maybe: '', industry_no: 'Cannabis',
  matrix_row: { 'Max NSFs/Neg Days': '3', 'Min Deposits/Month': '5', 'Min Funding': '5000' },
};
const deal = {
  monthly_revenue: 30000, time_in_business_months: 12, fico: 650, positions: 0, nsf_count: 0,
  deposits: 10, state: 'CA', industry: 'Retail', requested_amount: 12000,
};

test('processing routes active funders and treats the stored count as existing positions', () => {
  const [result] = evaluateProcessingFunders([{ ...funder, id: 'inactive', is_active: false }, funder], deal);
  assert.equal(result.funderId, 'funder');
  assert.equal(result.fit, 'YES');
  assert.match(result.reasons.find(reason => reason.message.includes('Position')).message, /1st/);
});

test('processing flags unknown evidence and respects definitive exclusions', () => {
  assert.equal(evaluateProcessingFunders([funder], { ...deal, fico: 0 })[0].fit, 'MAYBE');
  assert.equal(evaluateProcessingFunders([funder], { ...deal, state: 'TX' })[0].fit, 'NO');
  assert.equal(evaluateProcessingFunders([funder], { ...deal, industry: 'Cannabis' })[0].fit, 'NO');
  assert.equal(evaluateProcessingFunders([funder], { ...deal, requested_amount: 3000 })[0].fit, 'NO');
  const variant = { ...funder, states: 'All except special rule: no home-based in CA', matrix_row: { ...funder.matrix_row, 'Max NSFs/Neg Days': 'Max 5 negative days' } };
  assert.equal(evaluateProcessingFunders([variant], { ...deal, nsf_count: 9 })[0].fit, 'MAYBE');
});
