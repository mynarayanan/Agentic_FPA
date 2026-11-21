'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Cockpit'],
  ['/variance', 'Variance'],
  ['/forecast', 'Forecast'],
  ['/actions', 'Actions'],
  ['/assistant', 'Assistant'],
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
