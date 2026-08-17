'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/sessionContext';

/**
 * Exact match, or `pathname` nested one level or deeper under `href` —
 * `/my/items/anything` counts as "under" `/my/items`. Exported for Header,
 * which applies the same rule to the Post and Log in links: those live
 * outside this component (Post is a filled CTA, Log in only shows when
 * signed out) but should be judged "active" the same way.
 */
export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavRoute = {
  href: '/' | '/my/items' | '/my/claims' | '/admin';
  key: 'feed' | 'myItems' | 'myClaims' | 'admin';
  isActive: (pathname: string) => boolean;
};

// "Items" also covers item detail pages (`/items/:id`) — but not
// `/items/new`, which belongs to "Post" instead.
const ROUTES: NavRoute[] = [
  {
    href: '/',
    key: 'feed',
    isActive: (pathname) =>
      pathname === '/' || (pathname.startsWith('/items/') && !pathname.startsWith('/items/new')),
  },
  {
    href: '/my/items',
    key: 'myItems',
    isActive: (pathname) => isPathActive(pathname, '/my/items'),
  },
  {
    href: '/my/claims',
    key: 'myClaims',
    isActive: (pathname) => isPathActive(pathname, '/my/claims'),
  },
];

const ADMIN_ROUTE: NavRoute = {
  href: '/admin',
  key: 'admin',
  isActive: (pathname) => isPathActive(pathname, '/admin'),
};

const ACTIVE_CLASSES = 'bg-brand-tint text-brand-strong';

const VARIANT_CLASSES = {
  desktop: {
    nav: 'flex items-center gap-1 text-sm font-medium text-neutral-700 sm:gap-2',
    link: 'rounded px-3 py-1.5 transition-colors',
    inactive: 'text-neutral-700 hover:text-brand-strong',
  },
  drawer: {
    nav: 'flex flex-col gap-1',
    link: 'block rounded px-3 py-3 text-base font-medium transition-colors',
    inactive: 'text-neutral-700 hover:bg-neutral-50',
  },
};

/**
 * The primary content links — every future screen this task scaffolds a
 * placeholder for, except "create," which Header renders separately as a
 * filled CTA rather than a plain nav link.
 *
 * The admin link only renders for a session with `isAdmin` set. `/admin`
 * 404s for everyone else by design (DECISIONS.md) — linking to a page
 * that will only ever 404 for the visitor is a real UX bug, and it
 * needlessly reveals that the surface exists at all.
 *
 * Rendered twice by Header: once as `variant="desktop"` in the row hidden
 * below `md`, once as `variant="drawer"` inside the mobile drawer — the
 * same dual-instance shape as FeedFilters' `FilterFields`. `onNavigate`
 * closes the drawer when a link is tapped; the desktop instance has no use
 * for it.
 */
export function Nav({
  variant,
  onNavigate,
}: {
  variant: 'desktop' | 'drawer';
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  const session = useSession();
  const pathname = usePathname();
  const routes = session?.isAdmin ? [...ROUTES, ADMIN_ROUTE] : ROUTES;
  const classes = VARIANT_CLASSES[variant];

  return (
    <nav className={classes.nav}>
      {routes.map((route) => {
        const active = route.isActive(pathname);
        return (
          <Link
            key={route.href}
            href={route.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`${classes.link} ${active ? ACTIVE_CLASSES : classes.inactive}`}
          >
            {t(route.key)}
          </Link>
        );
      })}
    </nav>
  );
}
