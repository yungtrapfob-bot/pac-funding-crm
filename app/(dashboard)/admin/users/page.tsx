import { formatPacificDate } from '@/lib/pacific-time';
import { CreateUserForm } from '@/components/admin/create-user-form';
import { ManageRepForm } from '@/components/admin/manage-rep-form';
import { requireRole } from '@/lib/auth';
import { getInternalUserProfiles } from '@/lib/internal-users';

export default async function UsersPage() {
  await requireRole(['admin']);
  const users = await getInternalUserProfiles();

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
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-2 font-medium">{u.full_name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2 uppercase">{u.role}</td>
                <td className="p-2">{u.is_active ? "Active" : "Inactive"}</td>
                <td className="p-2">{formatPacificDate(u.created_at)}</td>
                <td className="p-2">{u.role === 'rep' && <ManageRepForm
                  id={u.id}
                  name={u.full_name ?? u.email ?? 'Rep'}
                  active={u.is_active}
                  recipients={users.filter((rep) => rep.role === 'rep' && rep.is_active && rep.id !== u.id).map((rep) => ({ id: rep.id, name: rep.full_name ?? rep.email ?? rep.id }))}
                />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
