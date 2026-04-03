import { clsx, type ClassValue } from 'clsx';

export function cn(...args: ClassValue[]) {
  return clsx(args);
}

export const PIPELINE_STAGES = [
  'Application Submitted',
  'Application Processed',
  'Offers / Declines Received',
  'Deal Pitched',
  'Contracts Requested',
  'Contracts Signed',
  'Funded',
  'Killed'
] as const;
