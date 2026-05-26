import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MissingProfileError, ProfileQueryError } from '@/lib/auth-errors';
import type { UserRole } from '@/types/db';

export async function requireUser() {
  const supabase = await createClient();
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
    const detailedMessage = [
      'Your account is authenticated, but your CRM profile query failed.',
      `Supabase: ${profileError.message}`,
      profileError.code ? `code=${profileError.code}` : null,
      profileError.details ? `details=${profileError.details}` : null,
      profileError.hint ? `hint=${profileError.hint}` : null
    ]
      .filter(Boolean)
      .join(' | ');

    console.error('[auth] failed to query profile for authenticated user', {
      userId: user.id,
      profileError: profileError.message,
      profileErrorCode: profileError.code ?? null,
      profileErrorDetails: profileError.details ?? null,
      profileErrorHint: profileError.hint ?? null
    });
    throw new ProfileQueryError(detailedMessage);
  }

  if (!profile) {
    const roleInput = String(user.user_metadata?.role ?? '').toLowerCase();
    const isUserRole = roleInput === 'admin' || roleInput === 'rep';
    if (isUserRole && user.email) {
      const adminClient = createAdminClient();
      const { error: repairError } = await adminClient.from('profiles').upsert(
        {
          id: user.id,
          email: user.email.toLowerCase(),
          full_name: String(user.user_metadata?.full_name ?? user.email),
          role: roleInput as UserRole
        },
        { onConflict: 'id' }
      );
      if (!repairError) {
        const { data: repairedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (repairedProfile) {
          return { user, profile: repairedProfile as { role: UserRole; full_name: string; id: string } };
        }
      }
    }

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
