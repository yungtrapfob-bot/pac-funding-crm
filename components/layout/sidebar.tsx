'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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

export function Sidebar({
  isAdmin,
  userName,
  userEmail,
  userRole
}: {
  isAdmin: boolean;
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const links = isAdmin ? [...commonLinks, ...adminLinks] : commonLinks;

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
    <aside className="flex w-72 flex-col border-r border-border bg-card p-5">
      <div className="mb-6 rounded-lg border border-border/80 bg-background/60 p-4">
        <Image
          src="/brand/paragon-logo.svg"
          alt="Paragon Alternative Capital"
          width={360}
          height={60}
          className="h-auto w-full"
          priority
        />
        <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Funding CRM Platform</p>
      </div>

      <nav className="space-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'block rounded-md px-3 py-2 text-sm',
              pathname === link.href ? 'bg-primary text-white' : 'hover:bg-muted'
            )}
          >
            {link.label}
          </Link>
        ))}
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
