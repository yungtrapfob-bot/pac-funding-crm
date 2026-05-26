'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/db';
import type { CreateUserFormState } from '@/actions/admin-users-form-state';

function isUserRole(value: string): value is UserRole {
  return value === 'admin' || value === 'rep';
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createAdminClient>, email: string) {
  let page = 1;

  while (true) {
    const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (listError) {
      throw new Error(listError.message);
    }

    const users = usersPage?.users ?? [];
    const matchedUser = users.find((user) => user.email?.toLowerCase() === email);
    if (matchedUser) return matchedUser;
    if (users.length < 200) return null;
    page += 1;
  }
}

async function upsertProfileForAuthUser(
  adminClient: ReturnType<typeof createAdminClient>,
  {
    id,
    email,
    fullName,
    role
  }: { id: string; email: string; fullName: string; role: UserRole }
) {
  const { error } = await adminClient.from('profiles').upsert(
    {
      id,
      full_name: fullName,
      email,
      role
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
}

export async function reconcileInternalAuthUsers(): Promise<number> {
  const adminClient = createAdminClient();
  let page = 1;
  let synced = 0;

  while (true) {
    const { data: usersPage, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Unable to list auth users for reconciliation: ${error.message}`);
    const users = usersPage?.users ?? [];
    for (const user of users) {
      const roleInput = String(user.user_metadata?.role ?? '').toLowerCase();
      if (!isUserRole(roleInput)) continue;
      await upsertProfileForAuthUser(adminClient, {
        id: user.id,
        email: String(user.email ?? '').toLowerCase(),
        fullName: String(user.user_metadata?.full_name ?? user.email ?? 'Unknown User'),
        role: roleInput
      });
      synced += 1;
    }
    if (users.length < 200) break;
    page += 1;
  }

  return synced;
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

  let existingUser = null;
  try {
    existingUser = await findAuthUserByEmail(adminClient, email);
  } catch (error) {
    return { status: 'error', message: `Failed to check for existing auth user ${email}: ${String(error)}` };
  }

  let targetUserId: string | null = existingUser?.id ?? null;
  const reusedExistingUser = Boolean(existingUser);

  if (existingUser) {
    const { error: updateExistingError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
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
  } else {
    const { data: createdUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role
      }
    });
    if (authError || !createdUser?.user?.id) {
      return {
        status: 'error',
        message: authError?.message ?? `Failed to create auth user for ${email}.`
      };
    }
    targetUserId = createdUser.user.id;
  }

  try {
    await upsertProfileForAuthUser(adminClient, {
      id: targetUserId!,
      email,
      fullName,
      role
    });
  } catch (error) {
    return {
      status: 'error',
      message: `Auth user synced, but profile write failed: ${String(error)}`
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
