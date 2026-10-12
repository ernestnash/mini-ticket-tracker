'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Tickets' },
  { href: '/new', label: 'New ticket' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Ticket tracker
      </Link>
      <nav aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
