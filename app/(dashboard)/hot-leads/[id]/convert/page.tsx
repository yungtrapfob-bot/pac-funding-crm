import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ConvertHotLeadForm } from '@/components/hot-leads/convert-hot-lead-form';

export default async function ConvertHotLeadPage({ params }: { params: { id: string } }) {
  const { profile } = await requireUser();
  const supabase = await createClient();

  let leadQuery = supabase.from('hot_leads').select('*').eq('id', params.id);
  if (profile.role === 'rep') leadQuery = leadQuery.eq('assigned_rep_id', profile.id);

  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return <p>Hot lead not found.</p>;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Application / Underwriting Intake</h1>
        <Link href={`/hot-leads/${lead.id}`} className="text-sm text-primary hover:underline">Back to hot lead</Link>
      </div>
      <Card>
        <p className="mb-4 text-sm text-muted-foreground">Review and complete this intake. Submitting creates a deal in the <strong>In Underwriting</strong> stage.</p>
        <ConvertHotLeadForm lead={lead} />
      </Card>
    </div>
  );
}
