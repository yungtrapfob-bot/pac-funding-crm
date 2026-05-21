import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children, isAdmin, userName, userEmail, userRole }: { children: React.ReactNode; isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1800px]">
        <Sidebar isAdmin={isAdmin} userName={userName} userEmail={userEmail} userRole={userRole} />
        <main className="min-w-0 flex-1 p-5 md:p-7">
          <div className="mb-5 rounded-lg border border-border/80 bg-card px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Paragon Internal Platform</p>
            <p className="text-sm font-medium text-foreground">Deal lifecycle operations console</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
