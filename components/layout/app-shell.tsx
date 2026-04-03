import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin: boolean }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
