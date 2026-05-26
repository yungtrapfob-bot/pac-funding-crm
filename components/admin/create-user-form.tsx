'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createRepUserAction } from '@/actions/admin-users';
import { initialCreateUserFormState } from '@/actions/admin-users-form-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create user'}
    </Button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useFormState(createRepUserAction, initialCreateUserFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-lg font-semibold">Create rep/admin user</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>Full name</span>
          <Input name="fullName" placeholder="Eric Johnson" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Email</span>
          <Input name="email" type="email" placeholder="eric@company.com" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Role</span>
          <select
            name="role"
            defaultValue="rep"
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="rep">Rep</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Password</span>
          <Input name="password" type="password" autoComplete="new-password" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Confirm password</span>
          <Input name="confirmPassword" type="password" autoComplete="new-password" required />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.status !== 'idle' ? (
          <p className={state.status === 'success' ? 'text-sm text-green-600' : 'text-sm text-red-600'}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
