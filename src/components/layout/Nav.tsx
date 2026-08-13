'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/sessionContext';

const ROUTES = [
  { href: '/', key: 'feed' },
  { href: '/my/items', key: 'myItems' },
  { href: '/my/claims', key: 'myClaims' },
] as const;

const ADMIN_ROUTE = { href: '/admin', key: 'admin' } as const;

/**
 * The primary content links — every future screen this task scaffolds a
 * placeholder for, except "create," which Header renders separately as a
 * filled CTA rather than a plain nav link.
 *
 * The admin link only renders for a session with `isAdmin` set. `/admin`
 * 404s for everyone else by design (DECISIONS.md) — linking to a page
 * that will only ever 404 for the visitor is a real UX bug, and it
 * needlessly reveals that the surface exists at all.
 */
export function Nav() {
  const t = useTranslations('nav');
  const session = useSession();
  const routes = session?.isAdmin ? [...ROUTES, ADMIN_ROUTE] : ROUTES;

  return (
    <nav className="flex items-center gap-4 text-sm font-medium text-neutral-700 sm:gap-6">
      {routes.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className="transition-colors hover:text-brand-strong"
        >
          {t(route.key)}
        </Link>
      ))}
    </nav>
  );
}
