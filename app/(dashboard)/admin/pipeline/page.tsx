import { updateDealStage } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth';
import { PIPELINE_STAGES, toDbPipelineStage } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

export default async function AdminPipelinePage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const { data: deals } = await supabase.from('deals').select('id,business_name,owner_name,current_stage').order('submitted_at', { ascending: false });
  const grouped = PIPELINE_STAGES.map((stage) => ({ stage, items: (deals ?? []).filter((d) => d.current_stage === toDbPipelineStage(stage)) }));
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Admin Pipeline</h1><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{grouped.map((group) => <Card key={group.stage}><h2 className="mb-3 font-medium">{group.stage} <span className="text-muted-foreground">({group.items.length})</span></h2>{!group.items.length ? <p className="text-sm text-muted-foreground">No deals in this stage.</p> : <div className="space-y-2">{group.items.map((deal) => <form key={deal.id} action={updateDealStage} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"><input type="hidden" name="deal_id" value={deal.id}/><div><p className="font-medium">{deal.business_name}</p><p className="text-muted-foreground">{deal.owner_name}</p></div><select name="current_stage" defaultValue={group.stage} className="rounded-md border border-border bg-transparent px-2 py-1 text-xs">{PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select><Button type="submit">Save</Button></form>)}</div>}</Card>)}</div></div>;
}
