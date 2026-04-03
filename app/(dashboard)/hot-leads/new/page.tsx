import { createHotLead } from '@/actions/deals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NewHotLeadPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">New Hot Lead</h1>
      <form action={createHotLead} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {['business_name','owner_name','phone','email','industry','monthly_revenue','time_in_business_months','state','positions','nsf_count','deposits','fico','next_follow_up_date','follow_up_status','outcome_tag'].map((field) => (
          <Input key={field} name={field} placeholder={field.replaceAll('_', ' ')} required={['business_name','owner_name','phone','email'].includes(field)} />
        ))}
        <Input name="notes" placeholder="notes" className="md:col-span-2" />
        <Button type="submit" className="md:col-span-2">Create Lead</Button>
      </form>
    </div>
  );
}
