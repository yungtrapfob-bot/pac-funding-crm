'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { manageRepUserAction } from '@/actions/admin-users';
import { initialCreateUserFormState } from '@/actions/admin-users-form-state';
import { Input } from '@/components/ui/input';

const selectClass = 'rounded-md border border-border px-2 py-1';

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">{pending ? 'Saving…' : 'Apply'}</button>;
}

export function ManageRepForm({ id, name, active, recipients }: {
  id: string;
  name: string;
  active: boolean;
  recipients: { id: string; name: string }[];
}) {
  const [operation, setOperation] = useState('');
  const [state, action] = useFormState(manageRepUserAction, initialCreateUserFormState);

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(event) => {
        if (operation === 'deactivate' && !window.confirm(`Deactivate ${name}? This stops their CRM access immediately.`)) event.preventDefault();
        if (operation === 'reassign' && !window.confirm(`Reassign all active leads assigned to ${name}?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="user_id" value={id} />
      <select aria-label={`Actions for ${name}`} name="operation" className={selectClass} value={operation} onChange={(event) => setOperation(event.target.value)}>
        <option value="">Choose action</option>
        <option value={active ? 'deactivate' : 'activate'}>{active ? 'Deactivate' : 'Activate'}</option>
        <option value="reset_password">Reset password</option>
        <option value="reassign" disabled={!recipients.length}>Reassign active leads</option>
      </select>
      {operation === 'reset_password' && <>
        <Input name="password" type="password" aria-label="New password" placeholder="New password" autoComplete="new-password" minLength={12} maxLength={72} required />
        <Input name="confirmPassword" type="password" aria-label="Confirm password" placeholder="Confirm password" autoComplete="new-password" minLength={12} maxLength={72} required />
      </>}
      {operation === 'reassign' && (
        <select name="recipient" aria-label="Recipient rep" required className={selectClass}>
          <option value="">Choose active rep</option>
          {recipients.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
        </select>
      )}
      {operation && <Submit />}
      {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-red-800' : 'text-green-800'}>{state.message}</p>}
    </form>
  );
}
