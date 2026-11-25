'use client';

import { useFormStatus } from 'react-dom';
import { updateDealStage } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { PIPELINE_STAGES } from '@/lib/utils';

function SubmitStageButton({ funding = false }: { funding?: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : funding ? 'Mark funded' : 'Move stage'}</Button>;
}

export function DealStageControls({ id, stage }: { id: string; stage: string }) {
  return <div className="space-y-3">
    <form action={updateDealStage} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="deal_id" value={id} />
      <label className="grid gap-1 text-sm">Pipeline stage
        <select name="current_stage" defaultValue={stage} className="rounded-md border border-border px-3 py-2">
          {PIPELINE_STAGES.filter(item => item !== 'KIF' && item !== 'Funded').map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <SubmitStageButton />
    </form>
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Record funding</summary>
      <form action={updateDealStage} className="mt-2 space-y-2 text-sm">
        <input type="hidden" name="deal_id" value={id} />
        <input type="hidden" name="current_stage" value="Funded" />
        <p>Save the confirmed funding date, amount, and gross commission in workflow details first.</p>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="confirm_funding" value="yes" required />
          I verified the funding details and understand this recognizes commission.
        </label>
        <SubmitStageButton funding />
      </form>
    </details>
  </div>;
}
