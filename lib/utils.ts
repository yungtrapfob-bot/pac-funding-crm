import { clsx, type ClassValue } from 'clsx';

export function cn(...args: ClassValue[]) {
  return clsx(args);
}

export const PIPELINE_STAGES = ['In Underwriting', 'Offers', 'Contracts Out', 'KIF', 'Funded'] as const;

export function addBusinessDays(startDate: string, businessDays: number) {
  const date = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

export function calculateFiftyPercentPaidDate(input: {
  fundedDate?: string | null;
  termPayments?: number | null;
  paymentFrequency?: string | null;
}) {
  if (!input.fundedDate || !input.termPayments || input.termPayments <= 0 || !input.paymentFrequency) return null;
  const halfPayments = Math.ceil(input.termPayments / 2);
  const date = new Date(input.fundedDate);
  const freq = input.paymentFrequency.toLowerCase();
  if (freq.includes('daily')) date.setDate(date.getDate() + halfPayments);
  else if (freq.includes('weekly')) date.setDate(date.getDate() + halfPayments * 7);
  else if (freq.includes('bi')) date.setDate(date.getDate() + halfPayments * 14);
  else if (freq.includes('month')) date.setMonth(date.getMonth() + halfPayments);
  else return null;
  return date.toISOString().slice(0, 10);
}
