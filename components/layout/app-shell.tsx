import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children, isAdmin, userName, userEmail, userRole }: { children: React.ReactNode; isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--bg))]">
      <div className="flex w-full">
        <Sidebar isAdmin={isAdmin} userName={userName} userEmail={userEmail} userRole={userRole} />
        <main className="min-w-0 flex-1">
          <header className="flex h-14 items-center border-b border-border bg-[hsl(var(--panel))] px-6">
            <div className="tracked-label text-muted-foreground">Operations / Live Pipeline</div>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
