import { createDeal } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SubmitDealPage() {
  const fields = [
    'business_name','owner_name','phone','email','industry','monthly_revenue','time_in_business_months','state','positions','nsf_count','deposits','fico'
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Submit Deal</h1>
      <form action={createDeal} className="grid grid-cols-1 gap-3 md:grid-cols-2" encType="multipart/form-data">
        {fields.map((field) => <Input key={field} name={field} placeholder={field.replaceAll('_', ' ')} required />)}
        <Input name="notes" placeholder="notes" className="md:col-span-2" />
        <Input name="internal_notes" placeholder="internal notes" className="md:col-span-2" />
        <label className="rounded-md border border-dashed border-border p-3 text-sm">
          Application File
          <Input type="file" name="application_file" className="mt-2" required />
        </label>
        <label className="rounded-md border border-dashed border-border p-3 text-sm">
          Bank Statements (multiple)
          <Input type="file" name="bank_statements" className="mt-2" multiple required />
        </label>
        <Button type="submit" className="md:col-span-2">Submit Deal</Button>
      </form>
    </div>
  );
}
