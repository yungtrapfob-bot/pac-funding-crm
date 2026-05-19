import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MissingProfileError, ProfileQueryError } from '@/lib/auth-errors';
import type { UserRole } from '@/types/db';

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    // If the session cannot be resolved on the server, treat as signed out.
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

  if (profileError) {
    console.error('[auth] failed to query profile for authenticated user', {
      userId: user.id,
      profileError: profileError.message,
      profileErrorCode: profileError.code ?? null,
      profileErrorDetails: profileError.details ?? null,
      profileErrorHint: profileError.hint ?? null
    });
    throw new ProfileQueryError();
  }

  if (!profile) {
    console.error('[auth] missing profile row for authenticated user', {
      userId: user.id
    });
    throw new MissingProfileError();
  }

  return { user, profile: profile as { role: UserRole; full_name: string; id: string } };
}

export async function requireRole(roles: UserRole[]) {
  const ctx = await requireUser();
  if (!roles.includes(ctx.profile.role)) {
    redirect('/dashboard');
  }
  return ctx;
}
