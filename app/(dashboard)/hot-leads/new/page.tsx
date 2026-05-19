import { NewHotLeadForm } from '@/components/hot-leads/new-hot-lead-form';

export default function NewHotLeadPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">New Hot Lead</h1>
      <p className="text-sm text-muted-foreground">Create a lead and immediately move into follow-up.</p>
      <NewHotLeadForm />
    </div>
  );
}
