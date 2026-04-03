import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  return <AppShell isAdmin={profile.role === 'admin'}>{children}</AppShell>;
}
