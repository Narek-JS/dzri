'use client';

import { useEffect, useId, useState } from 'react';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { buttonClassName } from '@/components/ui/Button';
import { containerClassName } from '@/components/ui/Container';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/sessionContext';

import { LanguageSwitcher } from './LanguageSwitcher';
import { isPathActive, Nav } from './Nav';

function MenuIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M3 6H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 14H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Post link, signed-in-state slot, and the language switcher. Rendered
 * twice by Header — once as `variant="desktop"` (hidden below `md`), once
 * as `variant="drawer"` inside the mobile drawer — the same dual-instance
 * shape as `Nav` and FeedFilters' `FilterFields`. The logout request and
 * its pending state live once, in Header, and are passed down so either
 * instance behaves identically; only one is ever visible/interactive at a
 * given viewport width.
 */
function AccountCluster({
  variant,
  onNavigate,
  onLogout,
  loggingOut,
}: {
  variant: 'desktop' | 'drawer';
  onNavigate?: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const t = useTranslations();
  const session = useSession();
  const pathname = usePathname();

  const postActive = isPathActive(pathname, '/items/new');
  const loginActive = isPathActive(pathname, '/login');

  const postLink = (
    <Link
      href="/items/new"
      onClick={onNavigate}
      aria-current={postActive ? 'page' : undefined}
      className={buttonClassName({ variant: postActive ? 'secondary' : 'primary', size: 'sm' })}
    >
      {t('nav.create')}
    </Link>
  );

  const sessionSlot = session ? (
    <span
      className={
        variant === 'desktop'
          ? 'flex items-center gap-3 text-sm text-neutral-600'
          : 'flex items-center justify-between gap-3'
      }
    >
      <span className="rounded bg-brand-tint px-2 py-0.5 font-medium text-brand-strong">
        {session.displayName}
      </span>
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className={buttonClassName({ variant: 'ghost' })}
      >
        {t('session.logout')}
      </button>
    </span>
  ) : (
    <Link
      href="/login"
      onClick={onNavigate}
      aria-current={loginActive ? 'page' : undefined}
      className={
        loginActive
          ? 'rounded bg-brand-tint px-2 py-1 text-sm font-medium text-brand-strong'
          : 'text-sm text-neutral-600 hover:text-brand-strong'
      }
    >
      {t('session.login')}
    </Link>
  );

  if (variant === 'drawer') {
    return (
      <div className="flex flex-col gap-3">
        {postLink}
        {sessionSlot}
        <LanguageSwitcher />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-l border-neutral-200 pl-3 sm:gap-4 sm:pl-4">
      {postLink}
      {sessionSlot}
      <LanguageSwitcher />
    </div>
  );
}

/**
 * Wordmark, nav, a signed-in-state slot, and the language switcher.
 * `useSession()` reads the value `[locale]/layout.tsx` put in
 * `SessionProvider` — no fetch here.
 *
 * Below `md` — the same breakpoint FeedFilters switches at, so the header
 * and the filter bar collapse together — everything but the hamburger and
 * wordmark moves into a bottom-sheet drawer, reusing FeedFilters' drawer
 * shape verbatim (scrim, rounded-t-lg sheet, Escape-to-close, tap-outside-
 * to-close) rather than inventing a second drawer pattern. `md` and up is
 * the original single-row layout, unchanged.
 */
export function Header() {
  const t = useTranslations();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTitleId = useId();

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await api.auth.logout();
    } finally {
      setLoggingOut(false);
    }
    // No push() here, so none of the push/refresh ordering [locale]/login's
    // completeSignIn() has to worry about applies — refresh() re-fetches
    // the layout (and this header) for whatever page we're already on.
    // Verified in a browser: this alone updates the header immediately,
    // no reload, once [locale]/layout.tsx stopped being misclassified as
    // static (see the `dynamic` export there).
    router.refresh();
  }

  async function handleLogoutFromDrawer() {
    await handleLogout();
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  return (
    <header className="border-b border-neutral-200 py-4">
      <div
        className={containerClassName({ className: 'flex items-center justify-between gap-4' })}
      >
        {/* Primary navigation cluster: hamburger (mobile only), wordmark,
            and the desktop nav row (hidden below md). */}
        <div className="flex items-center gap-4 sm:gap-10">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('shell.menu')}
            className="-ml-2 rounded p-2.5 text-neutral-700 hover:bg-neutral-100 md:hidden"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <Link href="/" className="flex items-center">
            {/* SVG source is a real vector lockup (icon + wordmark) — not
                optimized through the raster pipeline since it doesn't need
                resizing/format conversion, only CSS-driven scaling. */}
            <Image
              src="/dzri-icon.svg"
              alt={t('shell.wordmark')}
              width={1280}
              height={427}
              unoptimized
              priority
              className="h-8 w-auto sm:h-9"
            />
          </Link>

          <div className="hidden md:block">
            <Nav variant="desktop" />
          </div>
        </div>

        {/* Account / utility cluster, hidden below md — it lives in the
            drawer there instead. */}
        <div className="hidden md:flex">
          <AccountCluster variant="desktop" onLogout={handleLogout} loggingOut={loggingOut} />
        </div>
      </div>

      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={drawerTitleId}
          className="fixed inset-0 z-50 flex items-end md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-neutral-900/50" aria-hidden="true" />
          <div
            className="relative flex max-h-[85vh] w-full flex-col gap-4 rounded-t-lg bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id={drawerTitleId} className="text-base font-semibold text-neutral-900">
                {t('shell.menu')}
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('feed.filters.close')}
                className="text-2xl leading-none text-neutral-500"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto">
              <Nav variant="drawer" onNavigate={() => setDrawerOpen(false)} />

              <div className="border-t border-neutral-200 pt-4">
                <AccountCluster
                  variant="drawer"
                  onNavigate={() => setDrawerOpen(false)}
                  onLogout={handleLogoutFromDrawer}
                  loggingOut={loggingOut}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
