import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children, isAdmin, userName, userEmail, userRole }: { children: React.ReactNode; isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--bg))]">
      <div className="flex w-full flex-col md:flex-row">
        <Sidebar isAdmin={isAdmin} userName={userName} userEmail={userEmail} userRole={userRole} />
        <main className="min-w-0 flex-1">
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
