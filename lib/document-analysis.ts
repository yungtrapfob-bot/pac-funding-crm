import { z } from 'zod';

const isoDay = z.iso.date();
const cents = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
const transaction = z.object({
  date: isoDay, amount: cents, page: z.number().int().min(1).max(500),
  category: z.enum(['operating', 'transfer', 'loan_proceeds', 'refund', 'mca_suspected', 'nsf', 'returned', 'other', 'uncertain']),
  descriptor: z.string().max(80).nullable(),
});
export const documentFacts = z.object({
  application: z.object({
    legal_name: z.string().max(150).nullable(), dba: z.string().max(150).nullable(),
    industry: z.string().max(100).nullable(), address: z.string().max(200).nullable(), state: z.string().max(2).nullable(),
    months_in_business: z.number().int().min(0).max(1200).nullable(),
    requested_cents: cents.nullable(), existing_obligations: z.string().max(300).nullable(),
    file: z.number().int().min(0).max(7), page: z.number().int().min(1).max(500),
  }).nullable(),
  statements: z.array(z.object({
    file: z.number().int().min(0).max(7), start: isoDay, end: isoDay,
    account_tag: z.string().max(40).nullable(), opening: cents.nullable(), closing: cents.nullable(),
    complete: z.boolean(), rows: z.array(transaction).max(2000),
  })).max(12),
  flags: z.array(z.enum(['unreadable','missing_pages','inconsistent_names','incomplete','unusual_deposit','inconsistent_accounts'])).max(12),
});
type Facts = z.infer<typeof documentFacts>;
const utcDay = 86_400_000;
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const average = (values: number[]) => values.length ? Math.round(total(values) / values.length) : null;

export function summarizeFinancialFacts(facts: Facts) {
  const flags = new Set<string>(facts.flags);
  const seen = new Set<string>();
  const periods: { account: string | null; start: string; end: string }[] = [];
  const months = [];
  for (const statement of [...facts.statements].sort((a,b) => a.start.localeCompare(b.start))) {
    const { rows, opening, closing, start, end } = statement;
    const days = (Date.parse(end) - Date.parse(start)) / utcDay + 1;
    if (days < 1 || days > 35 || rows.some(row => row.date < start || row.date > end)) {
      flags.add('Invalid statement period or transaction date');
      continue;
    }
    const signature = JSON.stringify([statement.account_tag, start, end, opening, closing, rows.map(row => [row.date,row.amount]).sort()]);
    if (seen.has(signature)) { flags.add('Duplicate statement'); continue; }
    seen.add(signature);
    if (periods.some(period => period.account === statement.account_tag && start <= period.end && end >= period.start)) {
      flags.add('Overlapping statement periods excluded from totals');
      continue;
    }
    periods.push({ account: statement.account_tag, start, end });
    const deposits = rows.filter(row => row.amount > 0);
    const reconciled = statement.complete && opening !== null && closing !== null && opening + total(rows.map(row => row.amount)) === closing;
    if (!reconciled) flags.add('Insufficient or unreconciled balance evidence');
    const dayTotals = new Map<string, number>();
    for (const row of rows) dayTotals.set(row.date, (dayTotals.get(row.date) ?? 0) + row.amount);
    const balances: number[] = [];
    if (reconciled && opening !== null) {
      let balance = opening;
      for (let day = 0; day < days; day++) {
        const date = new Date(Date.parse(start) + day * utcDay).toISOString().slice(0,10);
        balance += dayTotals.get(date) ?? 0;
        balances.push(balance);
      }
    }
    months.push({
      source: statement.file, start, end, opening, closing, reconciled,
      deposits: total(deposits.map(row => row.amount)), withdrawals: -total(rows.filter(row => row.amount < 0).map(row => row.amount)),
      qualifyingRevenue: total(deposits.filter(row => row.category === 'operating').map(row => row.amount)),
      depositCount: deposits.length, balanceSum: total(balances), averageBalance: average(balances), negativeDays: balances.length ? balances.filter(value => value < 0).length : null,
      nsfs: rows.filter(row => row.category === 'nsf').length, returns: rows.filter(row => row.category === 'returned').length,
      potentialMca: rows.filter(row => row.category === 'mca_suspected' && row.amount < 0),
      adjustments: deposits.filter(row => row.category !== 'operating').map(({date,amount,page,category}) => ({date,amount,page,category})),
    });
  }
  for (const [index, period] of periods.entries()) {
    const earlier = periods.slice(0,index).findLast(item => item.account === period.account);
    if (earlier && Date.parse(period.start) - Date.parse(earlier.end) > utcDay) flags.add('Gap between statement periods');
  }
  if (months.length > 0 && months.length < 4) flags.add('Fewer than four statement periods were analyzed');
  const multipleAccounts = new Set(periods.map(period => period.account)).size > 1;
  if (multipleAccounts) flags.add('Multiple account series require manual aggregation');
  const completeSeries = months.length > 0 && months.every(month => month.reconciled) && !multipleAccounts
    && ![...flags].some(flag => /overlap|gap|unreadable|missing/i.test(flag));
  const weights = months.map(month => (Date.parse(month.end) - Date.parse(month.start)) / utcDay + 1);
  return {
    application: facts.application, months, flags: [...flags],
    averages: completeSeries ? {
      qualifyingRevenue: average(months.map(month => month.qualifyingRevenue)),
      deposits: average(months.map(month => month.depositCount)),
      dailyBalance: Math.round(total(months.map(month => month.balanceSum)) / total(weights)),
      negativeDays: average(months.map(month => month.negativeDays ?? 0)),
      nsfs: average(months.map(month => month.nsfs)),
    } : null,
  };
}
export type FinancialSummary = ReturnType<typeof summarizeFinancialFacts>;
