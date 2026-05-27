'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const sections = [
  { label: 'OPERATIONS', links: [{ href: '/dashboard', label: 'Dashboard' }, { href: '/hot-leads', label: 'Hot Leads / Tasks' }, { href: '/hot-leads/new', label: 'New Hot Lead' }] },
  { label: 'PIPELINE', links: [{ href: '/deals', label: 'Deals Pipeline' }, { href: '/commissions', label: 'Commissions' }] },
  { label: 'ADMIN', links: [{ href: '/admin', label: 'Admin Dashboard' }, { href: '/admin/pipeline', label: 'Admin Pipeline' }, { href: '/admin/processing', label: 'Processing Queue' }, { href: '/admin/funders', label: 'Funder Master' }, { href: '/admin/users', label: 'Users' }], adminOnly: true }
];

export function Sidebar({ isAdmin, userName, userEmail, userRole }: { isAdmin: boolean; userName: string; userEmail: string; userRole: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  async function handleSignOut() { setIsSigningOut(true); try { await fetch('/api/auth/signout', { method: 'POST' }); } finally { router.replace('/login'); router.refresh(); setIsSigningOut(false);} }
  return <aside className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col border-r border-border bg-[hsl(var(--panel))] p-4">
    <div className="border-b border-border pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">P</div>
        <div>
          <p className="tracked-label text-primary">PARAGON</p>
          <p className="tracked-label text-muted-foreground">Capital Desk</p>
        </div>
      </div>
    </div>
    <nav className="mt-4 space-y-4">{sections.filter((s)=>isAdmin || !s.adminOnly).map((section)=><div key={section.label}><p className="tracked-label mb-1 text-muted-foreground">{section.label}</p><div className="space-y-1">{section.links.map((link)=>{const active=pathname===link.href || (link.href!=='/dashboard'&&pathname?.startsWith(`${link.href}/`));return <Link key={link.href} href={link.href} className={cn('block rounded-md px-3 py-2 text-sm transition duration-120 ease-out',active?'bg-primary/12 text-foreground':'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>{link.label}</Link>;})}</div></div>)}</nav>
    <div className="mt-auto border-t border-border pt-3"><p className="tracked-label text-muted-foreground">ACCOUNT</p><div className="mt-2 rounded-md border border-border bg-card p-2"><p className="text-sm font-medium">{userName}</p><p className="text-xs text-muted-foreground">{userEmail}</p><p className="tracked-label mt-1 text-muted-foreground">{userRole}</p></div><button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut?'Signing Out...':'Sign Out'}</button></div>
  </aside>;
}
