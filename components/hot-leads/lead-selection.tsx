'use client';

import { useActionState, createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { manageHotLeads, type ManageLeadsState } from '@/actions/deals';

type Lead = { id: string; name: string };
type Operation = 'delete' | 'archive';

const Selection = createContext<{
  ids: string[];
  toggle: (id: string) => void;
} | null>(null);

export function LeadCheckbox({ lead }: { lead: Lead }) {
  const selection = useContext(Selection);
  if (!selection) return null;
  const checked = selection.ids.includes(lead.id);
  return (
    <input
      type="checkbox"
      aria-label={`Select ${lead.name}`}
      checked={checked}
      disabled={!checked && selection.ids.length >= 100}
      onChange={() => selection.toggle(lead.id)}
    />
  );
}

function ConfirmButton({ operation }: { operation: Operation }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded border border-border px-3 py-2 font-medium disabled:opacity-50">
      {pending ? 'Saving…' : operation === 'delete' ? 'Confirm deletion' : 'Confirm archive'}
    </button>
  );
}

export function LeadSelection({ leads, children }: { leads: Lead[]; children: ReactNode }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [state, action] = useActionState<ManageLeadsState, FormData>(manageHotLeads, { status: 'idle' });
  const selected = leads.filter((lead) => ids.includes(lead.id));

  useEffect(() => {
    if (state.status === 'success') {
      setIds([]);
      setOperation(null);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Selection.Provider value={{
      ids,
      toggle: (id) => {
        setOperation(null);
        setIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
      },
    }}>
      <div className="space-y-2 border-b border-border p-3 text-sm">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span>Actions</span>
            <select
              aria-label="Lead actions"
              value={operation ?? ''}
              disabled={!selected.length}
              onChange={(event) => setOperation((event.target.value || null) as Operation | null)}
              className="rounded border border-border px-2 py-1"
            >
              <option value="">Choose action</option>
              <option value="delete">Delete test leads</option>
              <option value="archive">Archive converted leads</option>
            </select>
          </label>
          <span>{selected.length} selected</span>
        </div>
        {state.message && (
          <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-red-800' : 'text-emerald-800'}>{state.message}</p>
        )}
        {operation && selected.length > 0 && (
          <form action={action} className="space-y-2 rounded border border-border bg-slate-50 p-3">
            <p className="font-medium">{operation === 'delete' ? 'Permanently delete' : 'Archive'} {selected.length} {selected.length === 1 ? 'lead' : 'leads'}?</p>
            <p>{operation === 'delete' ? 'Use only for test records. Lead-only activity will also be removed.' : 'Linked deals, activity and financial records will be kept.'}</p>
            <ul className="list-disc pl-5">
              {selected.map((lead) => (
                <li key={lead.id}>
                  {lead.name} <span className="font-mono text-xs text-slate-600">{lead.id}</span>
                  <input type="hidden" name="lead_ids" value={lead.id} />
                </li>
              ))}
            </ul>
            <input type="hidden" name="operation" value={operation} />
            <div className="flex gap-2">
              <ConfirmButton operation={operation} />
              <button type="button" onClick={() => setOperation(null)} className="px-3 py-2">Cancel</button>
            </div>
          </form>
        )}
      </div>
      {children}
    </Selection.Provider>
  );
}
