'use client';

import { createContext, useActionState, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { manageSalesLeads } from '@/actions/sales';

type Lead = { id: string; name: string };
const Selection = createContext<{ ids: string[]; toggle: (id: string) => void } | null>(null);
const operations = { archive: 'Archive', delete: 'Delete test leads', restore: 'Restore', reassign: 'Reassign' };

export function LeadCheckbox({ lead }: { lead: Lead }) {
  const selection = useContext(Selection);
  if (!selection) return null;
  const checked = selection.ids.includes(lead.id);
  return <input type="checkbox" aria-label={`Select ${lead.name}`} checked={checked}
    disabled={!checked && selection.ids.length >= 100} onChange={() => selection.toggle(lead.id)} />;
}

export function LeadSelection({ leads, children, reps }: { leads: Lead[]; children: ReactNode; reps: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [operation, setOperation] = useState('');
  const [state, dispatch, pending] = useActionState(manageSalesLeads, { status: 'idle' });
  const selected = leads.filter(lead => ids.includes(lead.id));
  const preview = state.preview?.operation === operation && state.preview?.rows.length === selected.length
    && state.preview.rows.every(row => selected.some(lead => lead.id === row.id)) ? state.preview : undefined;
  const eligible = preview?.rows.filter(row => !row.reason) ?? [];
  const blocked = preview?.rows.filter(row => row.reason) ?? [];

  useEffect(() => {
    if (state.status === 'success') {
      setIds([]);
      setOperation('');
      router.refresh();
    }
  }, [state, router]);

  return <Selection.Provider value={{
    ids, toggle: id => { if (!pending) setIds(current => current.includes(id) ? current.filter(i => i !== id) : [...current, id]); },
  }}>
    <div className="space-y-2 border-b border-border p-3 text-sm">
      <form action={dispatch} className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">Actions
          <select aria-label="Lead actions" name="operation" value={operation} disabled={pending || !selected.length}
            onChange={e => setOperation(e.target.value)} className="rounded border border-border px-2 py-1">
            <option value="">Choose action</option>
            {Object.entries(operations).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <span>{selected.length} selected</span>
        <input type="hidden" name="mode" value="preview" />
        {selected.map(lead => <input key={lead.id} type="hidden" name="lead_ids" value={lead.id} />)}
        <button type="submit" disabled={pending || !operation || !selected.length} className="rounded border border-border px-2 py-1 disabled:opacity-50">Review selection</button>
      </form>
      {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-red-800' : 'text-emerald-800'}>{state.message}</p>}
      {preview && <div className="space-y-2 rounded border border-border bg-slate-50 p-3">
        {!!blocked.length && <><p className="font-medium text-amber-900">Blocked leads</p>
          <ul className="list-disc pl-5">{blocked.map(row => <li key={row.id}>{row.business_name} · {row.reason}</li>)}</ul></>}
        {!!eligible.length && <form action={dispatch} className="space-y-2">
          <p className="font-medium">{operations[operation as keyof typeof operations]} {eligible.length} eligible {eligible.length === 1 ? 'lead' : 'leads'}?</p>
          <ul className="list-disc pl-5">{eligible.map(row => <li key={row.id}>{row.business_name} <span className="text-xs text-muted-foreground">{row.id}</span>
            <input type="hidden" name="lead_ids" value={row.id} /></li>)}</ul>
          <input type="hidden" name="operation" value={operation} />
          <input type="hidden" name="mode" value="apply" />
          {operation === 'reassign' && <label className="block">Assign to <select name="target" required className="rounded border border-border p-1">
            <option value="">Choose an active rep</option>{reps.map(rep => <option key={rep.id} value={rep.id}>{rep.full_name}</option>)}
          </select></label>}
          <button disabled={pending} type="submit" className="rounded border border-border px-2 py-1">{pending ? 'Saving…' : blocked.length ? 'Confirm eligible leads only' : 'Confirm action'}</button>
        </form>}
      </div>}
    </div>
    {children}
  </Selection.Provider>;
}
