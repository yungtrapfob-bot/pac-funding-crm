import { clsx, type ClassValue } from 'clsx';

export function cn(...args: ClassValue[]) {
  return clsx(args);
}

export const PIPELINE_STAGES = ['In Underwriting', 'Offers', 'Contracts Out', 'KIF', 'Funded'] as const;

export const UI_TO_DB_STAGE: Record<(typeof PIPELINE_STAGES)[number], string> = {
  'In Underwriting': 'Application Submitted',
  Offers: 'Offers / Declines Received',
  'Contracts Out': 'Contracts Requested',
  KIF: 'Killed',
  Funded: 'Funded'
};

const DB_TO_UI_STAGE: Record<string, (typeof PIPELINE_STAGES)[number]> = {
  'Application Submitted': 'In Underwriting',
  'Application Processed': 'In Underwriting',
  'In Underwriting': 'In Underwriting',
  'Offers / Declines Received': 'Offers',
  Offers: 'Offers',
  'Deal Pitched': 'Offers',
  'Contracts Requested': 'Contracts Out',
  'Contracts Signed': 'Contracts Out',
  'Contracts Out': 'Contracts Out',
  Killed: 'KIF',
  KIF: 'KIF',
  Funded: 'Funded'
};

export function toDbPipelineStage(uiStage: (typeof PIPELINE_STAGES)[number]) {
  return UI_TO_DB_STAGE[uiStage];
}

export function toUiPipelineStage(dbStage: string | null | undefined): (typeof PIPELINE_STAGES)[number] {
  if (!dbStage) return 'In Underwriting';
  return DB_TO_UI_STAGE[dbStage] ?? 'In Underwriting';
}

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
