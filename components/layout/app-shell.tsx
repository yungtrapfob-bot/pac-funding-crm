import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({
  children,
  isAdmin,
  userName,
  userEmail,
  userRole
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar isAdmin={isAdmin} userName={userName} userEmail={userEmail} userRole={userRole} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
