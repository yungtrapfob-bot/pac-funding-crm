import { NewHotLeadForm } from '@/components/hot-leads/new-hot-lead-form';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function NewHotLeadPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const reps = profile.role === 'admin'
    ? (await supabase.from('profiles').select('id,full_name').eq('role', 'rep').eq('is_active', true).order('full_name')).data
    : [];
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">New lead</h1>
      <NewHotLeadForm reps={reps ?? []} />
    </div>
  );
}
