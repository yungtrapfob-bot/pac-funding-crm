'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/db';
import type { CreateUserFormState } from '@/actions/admin-users-form-state';

function isUserRole(value: string): value is UserRole {
  return value === 'admin' || value === 'rep';
}

export async function createRepUserAction(
  _prevState: CreateUserFormState,
  formData: FormData
): Promise<CreateUserFormState> {
  await requireRole(['admin']);

  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const roleInput = String(formData.get('role') ?? 'rep');
  const role: UserRole = isUserRole(roleInput) ? roleInput : 'rep';

  if (!fullName || !email) {
    return { status: 'error', message: 'Full name and email are required.' };
  }

  const adminClient = createAdminClient();

  const { data: createdUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role
    }
  });

  if (authError || !createdUser.user) {
    return {
      status: 'error',
      message: authError?.message ?? 'Failed to create auth user.'
    };
  }

  const { error: profileError } = await adminClient.from('profiles').upsert(
    {
      id: createdUser.user.id,
      full_name: fullName,
      email,
      role
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    return {
      status: 'error',
      message: `Auth user created, but profile write failed: ${profileError.message}`
    };
  }

  revalidatePath('/admin/users');

  return {
    status: 'success',
    message: `User invited: ${email}`
  };
}
