import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type CommissionRow = {
  id: string;
  split_role: string;
  split_percent: number | string;
  commission_amount: number | string;
  deals: { business_name: string | null; funded_date: string | null } | null;
  profiles: { full_name: string | null } | null;
};

export default async function CommissionsPage() {
  const { profile } = await requireUser();
  const supabase = createClient();

  let query = supabase
    .from('commissions')
    .select('id, split_role, split_percent, commission_amount, deals(business_name, funded_date), profiles(full_name)')
    .order('created_at', { ascending: false });
  if (profile.role === 'rep') query = query.eq('rep_id', profile.id);
  const { data } = await query;
  const rows: CommissionRow[] = (data ?? []) as CommissionRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{profile.role === 'admin' ? 'Commission Ledger' : 'My Commissions'}</h1>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2">Deal</th>
              <th className="p-2">Rep</th>
              <th className="p-2">Role</th>
              <th className="p-2">Split %</th>
              <th className="p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-2">{row.deals?.business_name ?? '—'}</td>
                <td className="p-2">{row.profiles?.full_name ?? 'You'}</td>
                <td className="p-2">{row.split_role}</td>
                <td className="p-2">{Number(row.split_percent) * 100}%</td>
                <td className="p-2">${Number(row.commission_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
