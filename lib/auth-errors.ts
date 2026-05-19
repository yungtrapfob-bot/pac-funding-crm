export const MISSING_PROFILE_ERROR_NAME = 'MissingProfileError';

export class MissingProfileError extends Error {
  constructor() {
    super('Your account is authenticated, but no CRM profile was found. Please contact support.');
    this.name = MISSING_PROFILE_ERROR_NAME;
  }
}

export function isMissingProfileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === MISSING_PROFILE_ERROR_NAME;
}
