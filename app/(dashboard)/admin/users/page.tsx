import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function UsersPage() {
  await requireRole(['admin']);
  const supabase = createClient();
  const { data: users } = await supabase.from('profiles').select('*').order('created_at');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users / Rep Management</h1>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th></tr></thead>
          <tbody>{users?.map((u) => <tr key={u.id} className="border-t border-border"><td className="p-2">{u.full_name}</td><td className="p-2">{u.email}</td><td className="p-2">{u.role}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
