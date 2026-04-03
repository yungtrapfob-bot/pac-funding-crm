import { DealsTable } from '@/components/tables/deals-table';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function AdminPipelinePage() {
  await requireRole(['admin']);
  const supabase = createClient();
  const { data: deals } = await supabase.from('deals').select('*').order('submitted_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Pipeline</h1>
      <DealsTable deals={deals ?? []} />
    </div>
  );
}
