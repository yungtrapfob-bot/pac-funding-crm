export const MISSING_PROFILE_ERROR_NAME = 'MissingProfileError';
export const PROFILE_QUERY_ERROR_NAME = 'ProfileQueryError';

export class MissingProfileError extends Error {
  constructor() {
    super('Your account is authenticated, but no CRM profile was found. Please contact support.');
    this.name = MISSING_PROFILE_ERROR_NAME;
  }
}

export class ProfileQueryError extends Error {
  constructor(message = 'Your account is authenticated, but your CRM profile could not be queried.') {
    super(message);
    this.name = PROFILE_QUERY_ERROR_NAME;
  }
}

export function buildProfileQueryErrorMessage(params: {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message: string;
}) {
  const parts = [
    'Your account is authenticated, but your CRM profile query failed.',
    `Supabase message: ${params.message}`
  ];

  if (params.code) parts.push(`code: ${params.code}`);
  if (params.details) parts.push(`details: ${params.details}`);
  if (params.hint) parts.push(`hint: ${params.hint}`);

  return parts.join(' ');
}

export function isMissingProfileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === MISSING_PROFILE_ERROR_NAME;
}

export function isProfileQueryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === PROFILE_QUERY_ERROR_NAME;
}
