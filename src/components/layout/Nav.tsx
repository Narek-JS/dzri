'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

const ROUTES = [
  { href: '/', key: 'feed' },
  { href: '/my/items', key: 'myItems' },
  { href: '/my/claims', key: 'myClaims' },
  { href: '/admin', key: 'admin' },
] as const;

/**
 * The primary content links — every future screen this task scaffolds a
 * placeholder for, except "create," which Header renders separately as a
 * filled CTA rather than a plain nav link.
 */
export function Nav() {
  const t = useTranslations('nav');

  return (
    <nav className="flex items-center gap-4 text-sm">
      {ROUTES.map((route) => (
        <Link key={route.href} href={route.href} className="hover:text-brand-strong">
          {t(route.key)}
        </Link>
      ))}
    </nav>
  );
}
