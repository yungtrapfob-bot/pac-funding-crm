'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...commonLinks, ...adminLinks] : commonLinks;

  return (
    <aside className="w-64 border-r border-border bg-card p-4">
      <div className="mb-6 border-b border-border pb-4">
        <Image
          src="/brand/paragon-logo.svg"
          alt="Paragon Alternative Capital"
          width={300}
          height={50}
          className="h-auto w-full max-w-[230px]"
          priority
        />
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
    </aside>
  );
}
