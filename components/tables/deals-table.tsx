import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface DealRow {
  id: string;
  business_name: string;
  owner_name: string;
  current_stage: string;
  submitted_at: string;
  owner_profile?: { full_name?: string | null } | null;
  assigned_rep?: { full_name?: string | null } | null;
}

export function DealsTable({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return <p className="rounded-md border border-dashed border-border p-6 text-sm">No deals yet.</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
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
              <td className="p-2">
                <div>{deal.owner_name}</div>
                <div className="text-xs text-muted-foreground">
                  Rep: {deal.owner_profile?.full_name ?? deal.assigned_rep?.full_name ?? 'Unassigned'}
                </div>
              </td>
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
