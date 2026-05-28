'use client';

import { useFormStatus } from 'react-dom';
import { deleteHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';

type DeleteHotLeadFormProps = {
  leadId: string;
  businessName: string;
};

export function DeleteHotLeadForm({ leadId, businessName }: DeleteHotLeadFormProps) {
  return (
    <form
      action={deleteHotLead}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Delete hot lead "${businessName}"? This is intended only for junk/test leads and removes the lead plus its lead activity timeline. Converted leads are protected and will not be hard-deleted.`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="hot_lead_id" value={leadId} />
      <DeleteButton />
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="border border-red-300 bg-transparent text-red-700 hover:bg-red-50"
    >
      {pending ? 'Deleting...' : 'Delete test/junk lead'}
    </Button>
  );
}
