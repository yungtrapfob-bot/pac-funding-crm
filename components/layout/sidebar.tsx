'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const commonLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/hot-leads/new', label: 'New Hot Lead' },
  { href: '/deals/new', label: 'Submit Deal' },
  { href: '/commissions', label: 'My Commissions' }
];

const adminLinks = [
  { href: '/admin', label: 'Admin Dashboard' },
  { href: '/admin/pipeline', label: 'Admin Pipeline' },
  { href: '/admin/users', label: 'Users' }
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...commonLinks, ...adminLinks] : commonLinks;

  return (
    <aside className="w-64 border-r border-border bg-card p-4">
      <p className="mb-6 text-lg font-semibold">Paragon Arm</p>
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
    </aside>
  );
}
