import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();

  return (
    <AppShell
      isAdmin={profile.role === 'admin'}
      userName={profile.full_name}
      userEmail={user.email ?? 'Unknown email'}
      userRole={profile.role}
    >
      {children}
    </AppShell>
  );
}
