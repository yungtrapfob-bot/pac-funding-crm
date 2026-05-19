'use client';

import { MissingProfileError } from '@/lib/auth';

export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  if (error instanceof MissingProfileError || error.name === 'MissingProfileError') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Profile setup issue</h1>
        <p>
          You are signed in, but your user profile could not be loaded. Please contact support so your account can be completed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p>We could not load this page right now. Please try again.</p>
    </div>
  );
}
