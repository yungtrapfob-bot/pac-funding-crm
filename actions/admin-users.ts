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
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const role: UserRole = isUserRole(roleInput) ? roleInput : 'rep';

  if (!fullName || !email || !password || !confirmPassword) {
    return { status: 'error', message: 'Full name, email, password, and confirm password are required.' };
  }

  if (password !== confirmPassword) {
    return { status: 'error', message: 'Passwords do not match. Please re-enter both password fields.' };
  }

  const adminClient = createAdminClient();

  const { data: createdUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role
    }
  });

  let targetUserId = createdUser?.user?.id;
  let reusedExistingUser = false;

  if (authError || !targetUserId) {
    const errorMessage = authError?.message?.toLowerCase() ?? '';

    if (errorMessage.includes('already') || errorMessage.includes('exists') || errorMessage.includes('duplicate')) {
      let existingUserId: string | null = null;
      let page = 1;

      while (!existingUserId) {
        const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 200
        });

        if (listError) {
          return {
            status: 'error',
            message: `Failed to locate existing auth user for ${email}: ${listError.message}`
          };
        }

        const users = usersPage?.users ?? [];
        const matchedUser = users.find((user) => user.email?.toLowerCase() === email);

        if (matchedUser) {
          existingUserId = matchedUser.id;
          break;
        }

        if (users.length < 200) {
          break;
        }

        page += 1;
      }

      if (!existingUserId) {
        return {
          status: 'error',
          message: `An auth user with email ${email} appears to exist, but could not be located for sync.`
        };
      }

      const { error: updateExistingError } = await adminClient.auth.admin.updateUserById(existingUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role
        }
      });

      if (updateExistingError) {
        return {
          status: 'error',
          message: `Failed to update existing auth user ${email}: ${updateExistingError.message}`
        };
      }

      targetUserId = existingUserId;
      reusedExistingUser = true;
    } else {
      return {
        status: 'error',
        message: authError?.message ?? 'Failed to create auth user.'
      };
    }
  }

  const { error: profileError } = await adminClient.from('profiles').upsert(
    {
      id: targetUserId,
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
    message: reusedExistingUser
      ? `Existing user updated and synced: ${email}. Password reset and profile are now aligned.`
      : `User created: ${email}. The user can log in immediately with the admin-provided password.`
  };
}
