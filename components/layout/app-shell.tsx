import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children, isAdmin, userName, userEmail, userRole }: { children: React.ReactNode; isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1800px]">
        <Sidebar isAdmin={isAdmin} userName={userName} userEmail={userEmail} userRole={userRole} />
        <main className="min-w-0 flex-1 p-5 md:p-7">
          <div className="mb-6 rounded-xl border border-border/80 bg-card/95 px-5 py-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Paragon Internal Platform</p>
            <p className="text-base font-semibold text-foreground">Capital Brokerage Operations Console</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
