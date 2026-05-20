'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitHotLeadConversion, type ConvertLeadFormState } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const initialState: ConvertLeadFormState = { status: 'idle' };

type LeadIntake = { id: string; business_name: string | null; owner_name: string | null; phone: string | null; email: string | null; industry: string | null; monthly_revenue: number | null; time_in_business_months: number | null; state: string | null; positions: number | null; nsf_count: number | null; deposits: number | null; fico: number | null; notes: string | null; };

export function ConvertHotLeadForm({ lead }: { lead: LeadIntake }) {
  const [state, formAction] = useFormState(submitHotLeadConversion, initialState);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 md:grid-cols-2" encType="multipart/form-data">
      <input type="hidden" name="hot_lead_id" value={lead.id} />
      <Input name="business_name" defaultValue={lead.business_name ?? ''} required />
      <Input name="owner_name" defaultValue={lead.owner_name ?? ''} required />
      <Input name="phone" defaultValue={lead.phone ?? ''} required />
      <Input name="email" defaultValue={lead.email ?? ''} required />
      <Input name="industry" defaultValue={lead.industry ?? ''} required />
      <Input name="monthly_revenue" type="number" defaultValue={lead.monthly_revenue ?? 0} required />
      <Input name="time_in_business_months" type="number" defaultValue={lead.time_in_business_months ?? 0} required />
      <Input name="state" defaultValue={lead.state ?? ''} required />
      <Input name="positions" type="number" defaultValue={lead.positions ?? 0} required />
      <Input name="nsf_count" type="number" defaultValue={lead.nsf_count ?? 0} required />
      <Input name="deposits" type="number" defaultValue={lead.deposits ?? 0} required />
      <Input name="fico" type="number" defaultValue={lead.fico ?? 0} required />
      <textarea name="notes" defaultValue={lead.notes ?? ''} className="min-h-24 rounded-md border p-2 text-sm md:col-span-2" placeholder="Underwriting/application notes" />
      <textarea name="internal_notes" className="min-h-24 rounded-md border p-2 text-sm md:col-span-2" placeholder="Internal notes (optional)" />
      <label className="rounded-md border border-dashed border-border p-3 text-sm">
        Application File
        <Input type="file" name="application_file" className="mt-2" />
      </label>
      <label className="rounded-md border border-dashed border-border p-3 text-sm">
        Bank Statements / Docs (multiple)
        <Input type="file" name="bank_statements" className="mt-2" multiple />
      </label>

      {state.status === 'error' ? <p className="text-sm text-red-600 md:col-span-2">{state.message}</p> : null}

      <SubmitButton />
    </form>
  );
}


function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" className="md:col-span-2" disabled={pending}>{pending ? 'Submitting to Underwriting...' : 'Create Deal in Underwriting'}</Button>;
}
