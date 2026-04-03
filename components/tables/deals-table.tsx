import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface DealRow {
  id: string;
  business_name: string;
  owner_name: string;
  current_stage: string;
  submitted_at: string;
}

export function DealsTable({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return <p className="rounded-md border border-dashed border-border p-6 text-sm">No deals yet.</p>;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">Business</th>
            <th className="p-2">Owner</th>
            <th className="p-2">Stage</th>
            <th className="p-2">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id} className="border-t border-border">
              <td className="p-2">
                <Link href={`/deals/${deal.id}`} className="text-primary underline-offset-2 hover:underline">
                  {deal.business_name}
                </Link>
              </td>
              <td className="p-2">{deal.owner_name}</td>
              <td className="p-2">
                <Badge>{deal.current_stage}</Badge>
              </td>
              <td className="p-2">{new Date(deal.submitted_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
