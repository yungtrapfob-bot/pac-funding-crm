'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { confirmApplicationDocuments } from '@/actions/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ApplicationDocumentReview({ id, admin }: { id: string; admin: boolean }) {
  const [state, action, pending] = useActionState(confirmApplicationDocuments, { status: 'idle' });
  return <form action={action} className="my-3 space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
    <input type="hidden" name="id" value={id} />
    <h3 className="font-semibold">Confirm document review</h3>
    <p className="text-muted-foreground">Check that the application is complete and the statements cover four months.</p>
    <label className="flex items-center gap-2"><input type="checkbox" name="reviewed" value="yes" required /> I reviewed the application and statements</label>
    <label className="grid max-w-44 gap-1">Verified statement months
      <Input name="months" type="number" min={admin ? 1 : 4} max={24} required />
    </label>
    {admin && <label className="grid max-w-lg gap-1">Exception reason for fewer than four months
      <Input name="exception" maxLength={500} />
    </label>}
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
    <Button type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm documents'}</Button>
  </form>;
}

export function UploadDocumentsButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Uploading…' : 'Upload documents'}</Button>;
}
