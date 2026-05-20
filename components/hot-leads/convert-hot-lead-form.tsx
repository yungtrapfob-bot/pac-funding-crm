'use client';

import type { ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitHotLeadConversion, type ConvertLeadFormState } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const initialState: ConvertLeadFormState = { status: 'idle' };

type LeadIntake = { id: string; business_name: string | null; owner_name: string | null; phone: string | null; email: string | null; industry: string | null; monthly_revenue: number | null; time_in_business_months: number | null; state: string | null; positions: number | null; nsf_count: number | null; deposits: number | null; fico: number | null; notes: string | null; };

export function ConvertHotLeadForm({ lead }: { lead: LeadIntake }) {
  const [state, formAction] = useFormState(submitHotLeadConversion, initialState);

  return (
    <form action={formAction} className="space-y-5" encType="multipart/form-data">
      <input type="hidden" name="hot_lead_id" value={lead.id} />

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Business Info</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Business Name"><Input name="business_name" defaultValue={lead.business_name ?? ''} required /></Field>
          <Field label="Industry"><Input name="industry" defaultValue={lead.industry ?? ''} required /></Field>
          <Field label="State"><Input name="state" defaultValue={lead.state ?? ''} required /></Field>
          <Field label="Time in Business (Months)"><Input name="time_in_business_months" type="number" defaultValue={lead.time_in_business_months ?? 0} required /></Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Owner / Contact Info</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Owner Name"><Input name="owner_name" defaultValue={lead.owner_name ?? ''} required /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={lead.phone ?? ''} required /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={lead.email ?? ''} required /></Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Financial Snapshot</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Monthly Revenue"><Input name="monthly_revenue" type="number" defaultValue={lead.monthly_revenue ?? 0} required /></Field>
          <Field label="Positions"><Input name="positions" type="number" defaultValue={lead.positions ?? 0} required /></Field>
          <Field label="NSF Count"><Input name="nsf_count" type="number" defaultValue={lead.nsf_count ?? 0} required /></Field>
          <Field label="Deposits / Month"><Input name="deposits" type="number" defaultValue={lead.deposits ?? 0} required /></Field>
          <Field label="FICO"><Input name="fico" type="number" defaultValue={lead.fico ?? 0} required /></Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Notes</h3>
        <Field label="Notes"><textarea name="notes" defaultValue={lead.notes ?? ''} className="min-h-24 rounded-md border p-2 text-sm" /></Field>
        <Field label="Internal Notes"><textarea name="internal_notes" className="min-h-24 rounded-md border p-2 text-sm" /></Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">File Uploads</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Application File"><Input type="file" name="application_file" /></Field>
          <Field label="Bank Statements / Docs"><Input type="file" name="bank_statements" multiple required /></Field>
        </div>
      </section>

      {state.status === 'error' ? <p className="text-sm text-red-600">{state.message}</p> : null}
      <SubmitButton />
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Submitting to Underwriting...' : 'Create Deal in Underwriting'}</Button>;
}
