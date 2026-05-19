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

export function isMissingProfileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === MISSING_PROFILE_ERROR_NAME;
}

export function isProfileQueryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === PROFILE_QUERY_ERROR_NAME;
}
