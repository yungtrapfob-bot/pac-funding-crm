import { createDeal } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default async function SubmitDealPage({ searchParams: pendingSearchParams }: { searchParams: Promise<{ upload?: string }> }) {
  const searchParams = await pendingSearchParams;
  const fields = [
    'business_name','owner_name','phone','email','industry','monthly_revenue','time_in_business_months','state','positions','nsf_count','deposits','fico'
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Submit Deal</h1>
      {searchParams.upload === "missing" && <p role="alert" className="text-sm text-red-800">Attach a signed application and at least one bank statement.</p>}
      <form action={createDeal} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map((field) => <Input key={field} name={field} placeholder={field.replaceAll('_', ' ')} required />)}
        <label className="text-sm">Funding amount requested
          <Input name="requested_amount" type="number" min="0" max="9999999999.99" step="0.01" />
        </label>
        <Input name="notes" placeholder="notes" className="md:col-span-2" />
        <Input name="internal_notes" placeholder="internal notes" className="md:col-span-2" />
        <label className="rounded-md border border-dashed border-border p-3 text-sm">
          Application File (single)
          <Input type="file" name="application_file" className="mt-2" />
          <span className="mt-1 block text-xs text-muted-foreground">Attach when available. Incomplete files stay in the document queue.</span>
        </label>
        <label className="rounded-md border border-dashed border-border p-3 text-sm">
          Bank Statements / Docs (multiple files)
          <Input type="file" name="bank_statements" className="mt-2" multiple />
          <span className="mt-1 block text-xs text-muted-foreground">Select all bank statements and supporting documents at once.</span>
        </label>
        <Button type="submit" className="md:col-span-2">Submit Deal</Button>
      </form>
    </div>
  );
}
