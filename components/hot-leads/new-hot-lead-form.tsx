'use client';

import { useActionState, useState } from 'react';
import { createHotLead } from '@/actions/deals';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const contactFields = [
  { name: 'business_name', label: 'Business name', required: true },
  { name: 'owner_name', label: 'Contact name', required: true },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'next_follow_up_date', label: 'Next follow-up (Pacific)', type: 'datetime-local' },
];

const optionalFields = [
  { name: 'industry', label: 'Industry' },
  { name: 'state', label: 'State' },
  { name: 'monthly_revenue', label: 'Monthly revenue', type: 'number', min: 0 },
  { name: 'time_in_business_months', label: 'Months in business', type: 'number', min: 0 },
  { name: 'positions', label: 'Existing positions', type: 'number', min: 0 },
  { name: 'fico', label: 'Credit score', type: 'number', min: 300, max: 850 },
];

export function NewHotLeadForm({ reps = [] }: { reps?: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createHotLead, { status: 'idle' });
  const [values, setValues] = useState<Record<string, string>>({});
  const setField = (name: string, value: string) => setValues(current => ({ ...current, [name]: value }));

  function field({ name, label, ...props }: { name: string; label: string; type?: string; required?: boolean; min?: number; max?: number }) {
    const error = state.fieldErrors?.[name]?.[0];
    return <label key={name} className="grid gap-1 text-sm font-medium">{label}
      <Input {...props} name={name} value={values[name] ?? ''} onChange={event => setField(name, event.target.value)}
        aria-invalid={Boolean(error)} aria-describedby={error ? name + '-error' : undefined} />
      {error && <span id={name + '-error'} className="text-red-800">{error}</span>}
    </label>;
  }

  return <form action={formAction} className="rounded-lg border border-border bg-card p-4">
    {state.message && <p role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    <p className="mb-3 text-sm text-muted-foreground">Enter a business name, contact name, and either a phone number or email.</p>
    <div className="grid gap-3 sm:grid-cols-2">{contactFields.map(field)}</div>
    {reps.length > 0 && <label className="mt-3 grid max-w-sm gap-1 text-sm font-medium">Assign to
      <select name="assigned_rep_id" value={values.assigned_rep_id ?? ''} onChange={event => setField('assigned_rep_id', event.target.value)}
        className="rounded-md border border-border bg-card p-2">
        <option value="">Me</option>
        {reps.map(rep => <option key={rep.id} value={rep.id}>{rep.full_name}</option>)}
      </select>
    </label>}
    <label className="mt-3 grid gap-1 text-sm font-medium">Notes
      <textarea name="notes" maxLength={3000} value={values.notes ?? ''} onChange={event => setField('notes', event.target.value)}
        className="min-h-20 rounded-md border border-border bg-card p-2" />
    </label>
    <details className="my-4 border-y border-border py-3">
      <summary className="cursor-pointer text-sm font-medium">Optional business details</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{optionalFields.map(field)}</div>
    </details>
    {state.duplicate && <label className="mb-3 flex items-center gap-2 text-sm">
      <input type="checkbox" name="confirm_duplicate" value="yes" /> Create a separate opportunity
    </label>}
    <Button type="submit" disabled={pending}>{pending ? 'Creating lead…' : 'Create lead'}</Button>
  </form>;
}
