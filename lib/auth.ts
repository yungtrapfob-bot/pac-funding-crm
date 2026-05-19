import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/db';

export class MissingProfileError extends Error {
  constructor() {
    super('Your account is authenticated, but no profile was found. Please contact support.');
    this.name = 'MissingProfileError';
  }
}

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (profileError || !profile) throw new MissingProfileError();

  return { user, profile: profile as { role: UserRole; full_name: string; id: string } };
}

export async function requireRole(roles: UserRole[]) {
  const ctx = await requireUser();
  if (!roles.includes(ctx.profile.role)) {
    redirect('/dashboard');
  }
  return ctx;
}
