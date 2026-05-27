'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createHotLead, type HotLeadFormState } from '@/actions/deals';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const initialState: HotLeadFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} className="md:col-span-2">{pending ? 'Creating lead…' : 'Create Lead'}</Button>;
}

function ErrorText({ message }: { message?: string[] }) {
  if (!message?.length) return null;
  return <p className="text-sm text-red-600">{message[0]}</p>;
}

export function NewHotLeadForm() {
  const [state, formAction] = useFormState(createHotLead, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {state.status === 'error' && state.message ? <p className="md:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}
      <div><Input name="business_name" placeholder="Business name" required /><ErrorText message={state.fieldErrors?.business_name} /></div>
      <div><Input name="owner_name" placeholder="Owner name" required /><ErrorText message={state.fieldErrors?.owner_name} /></div>
      <div><Input name="phone" placeholder="Phone" required /><ErrorText message={state.fieldErrors?.phone} /></div>
      <div><Input type="email" name="email" placeholder="Email" required /><ErrorText message={state.fieldErrors?.email} /></div>
      <div><Input name="industry" placeholder="Industry" /><ErrorText message={state.fieldErrors?.industry} /></div>
      <div><Input type="number" name="monthly_revenue" placeholder="Monthly revenue" min={0} /><ErrorText message={state.fieldErrors?.monthly_revenue} /></div>
      <div><Input type="number" name="time_in_business_months" placeholder="Time in business (months)" min={0} /><ErrorText message={state.fieldErrors?.time_in_business_months} /></div>
      <div><Input name="state" placeholder="State" /><ErrorText message={state.fieldErrors?.state} /></div>
      <div><Input type="number" name="positions" placeholder="Positions" min={0} /><ErrorText message={state.fieldErrors?.positions} /></div>
      <div><Input type="number" name="nsf_count" placeholder="NSF count" min={0} /><ErrorText message={state.fieldErrors?.nsf_count} /></div>
      <div><Input type="number" name="deposits" placeholder="Deposits" min={0} /><ErrorText message={state.fieldErrors?.deposits} /></div>
      <div><Input type="number" name="fico" placeholder="FICO" min={300} max={850} /><ErrorText message={state.fieldErrors?.fico} /></div>
      <div><select name="follow_up_status" defaultValue="pending" className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"><option value="pending">pending</option><option value="contacted">contacted</option><option value="scheduled">scheduled</option><option value="stale">stale</option></select></div>
      <div><Input type="datetime-local" name="next_follow_up_date" /><ErrorText message={state.fieldErrors?.next_follow_up_date} /></div>
      <Input name="outcome_tag" placeholder="Outcome tag" />
      <textarea name="notes" placeholder="Initial contact context / notes" className="min-h-24 rounded-md border border-border bg-transparent p-3 text-sm md:col-span-2" />
      <SubmitButton />
    </form>
  );
}
