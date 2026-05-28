'use client';

import { useFormStatus } from 'react-dom';
import { deleteHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';

type DeleteHotLeadFormProps = {
  leadId: string;
  businessName: string;
  compact?: boolean;
};

export function DeleteHotLeadForm({ leadId, businessName, compact = false }: DeleteHotLeadFormProps) {
  return (
    <form
      action={deleteHotLead}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Delete hot lead "${businessName}"? This removes the test lead and its lead activity timeline. Converted leads are protected.`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="hot_lead_id" value={leadId} />
      <DeleteButton compact={compact} />
    </form>
  );
}

function DeleteButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={compact ? 'border border-red-300 bg-transparent px-2 py-1 text-xs text-red-700 hover:bg-red-50' : 'border border-red-300 bg-transparent text-red-700 hover:bg-red-50'}
    >
      {pending ? 'Deleting...' : compact ? 'Delete' : 'Delete test lead'}
    </Button>
  );
}
