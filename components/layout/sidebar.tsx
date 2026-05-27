'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const commonLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/hot-leads', label: 'Hot Leads / Tasks' },
  { href: '/hot-leads/new', label: 'New Hot Lead' },
  { href: '/deals', label: 'Deals Pipeline' },
  { href: '/commissions', label: 'My Commissions' }
];

const adminLinks = [
  { href: '/admin', label: 'Admin Dashboard' },
  { href: '/admin/pipeline', label: 'Admin Pipeline' },
  { href: '/admin/users', label: 'Users' }
];

export function Sidebar({ isAdmin, userName, userEmail, userRole }: { isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const links = useMemo(() => (isAdmin ? [...commonLinks, ...adminLinks] : commonLinks), [isAdmin]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
      setIsSigningOut(false);
    }
  }

  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-border/80 bg-card p-5 shadow-[inset_-1px_0_0_0_rgba(15,23,42,0.04)]">
      <div className="rounded-xl border border-border/90 bg-background/90 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30 p-2">
            <Image src="/brand/paragon-logo.svg" alt="Paragon Alternative Capital" width={160} height={48} className="h-full w-full object-contain" priority />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">Paragon Alternative Capital</p>
            <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Funding CRM Platform</p>
          </div>
        </div>
      </div>

      <nav className="mt-6 space-y-1.5">
        {links.map((link) => {
          const active = pathname === link.href || (link.href !== '/dashboard' && pathname?.startsWith(`${link.href}/`));
          return (
            <Link key={link.href} href={link.href} className={cn('block rounded-md border px-3 py-2 text-sm transition-colors', active ? 'border-primary/30 bg-primary text-white shadow-sm' : 'border-transparent hover:border-border hover:bg-muted/70')}>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-border pt-4">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{userRole}</p>
        </div>
        <Button type="button" className="w-full" onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </Button>
      </div>
    </aside>
  );
}
