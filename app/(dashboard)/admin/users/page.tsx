import { CreateUserForm } from '@/components/admin/create-user-form';
import { reconcileInternalAuthUsers } from '@/actions/admin-users';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function UsersPage() {
  await requireRole(['admin']);
  await reconcileInternalAuthUsers();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users / Rep Management</h1>
      <CreateUserForm />
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">User ID</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-2 font-medium">{u.full_name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2 uppercase">{u.role}</td>
                <td className="p-2 font-mono text-xs">{u.id}</td>
                <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
