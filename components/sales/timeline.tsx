import { formatPacificDate, formatPacificDateTime } from '@/lib/pacific-time';
import { dealStages, eventLabels, lossReasons } from '@/lib/sales-labels';
import { createClient } from '@/lib/supabase/server';

function displayTerms(note: string) {
  try {
    return Object.entries(JSON.parse(note)).map(([key, value]) => `${key.replaceAll('_',' ')}: ${String(value)}`).join(' · ');
  } catch {
    return note;
  }
}

export async function SalesTimeline({ entity, id }: { entity: 'lead' | 'deal'; id: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('crm_sales_events')
    .select('id,kind,occurred_at,date_only,note,reason,stage,funder,evidence,actor:actor_id(full_name)')
    .eq(entity === 'lead' ? 'lead_id' : 'deal_id', id).order('occurred_at', { ascending: false }).limit(40);
  if (error) return <p role="alert">Could not load sales history.</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No sales milestones recorded yet.</p>;
  return <ol className="space-y-2">
    {data.map(e => <li key={e.id} className="border-b border-border pb-2 text-sm">
      <p className="font-medium">{eventLabels[e.kind] ?? e.kind}{e.funder ? ` · ${e.funder}` : ''}</p>
      <p className="text-muted-foreground">{e.date_only ? `${formatPacificDate(e.occurred_at)} · time unknown` : formatPacificDateTime(e.occurred_at)}
        {e.evidence !== 'recorded' && ' · historical evidence'}
        {e.actor && ` · ${(Array.isArray(e.actor) ? e.actor[0] : e.actor)?.full_name ?? 'CRM user'}`}
        {e.reason && ` · ${lossReasons[e.reason] ?? e.reason}`}
        {e.kind === 'lost' && e.stage && ` · ${dealStages[e.stage] ?? eventLabels[e.stage] ?? e.stage}`}
      </p>
          {e.note && (e.kind === 'offer_response'
        ? <details className="text-muted-foreground"><summary>Recorded terms</summary><p className="break-words">{displayTerms(e.note)}</p></details>
        : <p className="whitespace-pre-wrap">{e.note}</p>)}
    </li>)}
  </ol>;
}
