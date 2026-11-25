'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { recordSalesAction } from '@/actions/sales';
import { dealStages, leadStages, lossReasons } from '@/lib/sales-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save action'}</Button>;
}

export function SalesActions({ entity, id, admin, lost, closed = false, hasTask, source, isTest, processors = [] }: {
  entity: 'lead' | 'deal'; id: string; admin: boolean; lost: boolean; closed?: boolean; hasTask: boolean;
  source?: string; isTest: boolean; processors?: { id: string; name: string }[];
}) {
  const [action, setAction] = useState('');
  const [state, submit, pending] = useActionState(recordSalesAction, { status: 'idle' });
  useEffect(() => { if (state.status === 'success') setAction(''); }, [state]);
  const options = closed || lost ? (lost && (entity === 'lead' || admin) ? { reopened: 'Reopen opportunity' } : {}) : {
    call: 'Log call', text: 'Log text', email: 'Log email', note: 'Add note', schedule: 'Set next follow-up',
    ...(hasTask ? { task_completed: 'Complete follow-up' } : {}),
    stage: 'Update operational stage', ...(entity === 'lead' || admin ? { lost: 'Mark lost' } : {}),
    ...(entity === 'deal' ? { pitched: 'Record offer pitched',
      ...(admin ? { submitted: 'Record funder submission', contracts_out: 'Record contract sent', contracts_signed: 'Record contract signed', processor: 'Assign processor' } : {}),
    } : {}),
  };
  const stageOptions = entity === 'lead' ? Object.entries(leadStages) : Object.entries(dealStages)
    .filter(([key]) => (admin ? ['processing','underwriting','stipulations','considering','contract_requested','final_conditions'] : ['considering','contract_requested']).includes(key));
  return <form action={submit} className="space-y-3">
    <input type="hidden" name="entity" value={entity} />
    <input type="hidden" name="id" value={id} />
    <label className="grid max-w-sm gap-1 text-sm font-medium">Sales action
      <select name="action" className="rounded border border-border p-2" value={action} onChange={e => setAction(e.target.value)} required disabled={pending}>
        <option value="">Choose action</option>
        {Object.entries({ ...options, source: 'Set lead source', ...(admin && !closed ? { test_record: 'Change test record designation' } : {}) })
          .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {action === 'lost' && <label className="grid gap-1 text-sm">Loss reason<select name="value" required className="rounded border border-border p-2">
      <option value="">Choose reason</option>
      {Object.entries(lossReasons).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>}
    {action === 'stage' && <label className="grid gap-1 text-sm">Operational stage<select name="value" required className="rounded border border-border p-2">
      {stageOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>}
    {action === 'schedule' && <div className="grid gap-2 sm:grid-cols-2">
      {entity === 'deal' && <label className="grid gap-1 text-sm">Next action<Input name="value" maxLength={200} required /></label>}
      <label className="grid gap-1 text-sm">Follow-up time (Pacific)<Input name="due" type="datetime-local" required /></label>
    </div>}
    {action === 'submitted' && <label className="grid gap-1 text-sm">Funder name<Input name="value" maxLength={200} required /></label>}
    {action === 'source' && <label className="grid gap-1 text-sm">Lead source<Input name="value" defaultValue={source} maxLength={200} /></label>}
    {action === 'processor' && <label className="grid gap-1 text-sm">Processor<select name="value" className="rounded border border-border p-2">
      <option value="">Unassigned</option>{processors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    {action === 'test_record' && <label className="grid gap-1 text-sm">Test record<select name="value" defaultValue={String(isTest)} className="rounded border border-border p-2">
      <option value="false">Genuine opportunity</option><option value="true">Synthetic test record</option>
    </select></label>}
    {action && <><label className="grid gap-1 text-sm">Notes<textarea name="note" maxLength={3000} required={action === 'note'} className="min-h-20 rounded border border-border p-2" /></label><Save /></>}
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-sm text-red-800' : 'text-sm text-emerald-800'}>{state.message}</p>}
  </form>;
}
