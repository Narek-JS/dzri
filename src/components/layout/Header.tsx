'use client';

import { useEffect, useId, useState } from 'react';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { Avatar } from '@/components/ui/Avatar';
import { buttonClassName } from '@/components/ui/Button';
import { containerClassName } from '@/components/ui/Container';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/sessionContext';

import { LanguageSwitcher } from './LanguageSwitcher';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';
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

function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 4V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 10H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Signed-in-state slot and the language switcher — the part of the header
 * that stays reachable without opening the mobile drawer. Post lives here
 * too on desktop, but not on mobile: alongside the logo, the language
 * switcher and avatar/Log out, it doesn't fit on one line at narrow
 * viewports, so it moves into the drawer instead, next to the nav links —
 * identity/utility (language, avatar, logout) stays persistent over the
 * CTA.
 *
 * Rendered twice by Header — once as `variant="desktop"` (hidden below
 * `md`, unchanged from before the drawer existed: text "Post" CTA, name
 * pill, plain-text "Log out"), once as `variant="mobile"` (hidden at `md`
 * and up: circular Avatar next to a compact "Log out") — the same
 * dual-instance shape as `Nav` and FeedFilters' `FilterFields`. Neither
 * instance calls the logout endpoint directly: tapping "Log out" only
 * opens the confirm dialog Header renders once; the actual request and its
 * pending state live there too, so either instance behaves identically and
 * only one is ever visible/interactive at a given viewport width.
 */
function AccountCluster({
  variant,
  onRequestLogout,
  loggingOut,
}: {
  variant: 'desktop' | 'mobile';
  onRequestLogout: () => void;
  loggingOut: boolean;
}) {
  const t = useTranslations();
  const session = useSession();
  const pathname = usePathname();

  const postActive = isPathActive(pathname, '/items/new');
  const loginActive = isPathActive(pathname, '/login');

  const loginLink = (
    <Link
      href="/login"
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

  if (variant === 'mobile') {
    // This same `loginLink` above renders under the 36px tap-target floor
    // (plain text-sm, no padding) — `min-h-9` floors its height without
    // touching the desktop instance, which renders `loginLink` directly,
    // below. `min-w-10` is untouched from the width-floor pass this task
    // doesn't revisit (height only). The ghost Log out button gets its
    // own height floor from `buttonClassName` itself now (Button.tsx), so
    // it only needs the width floor here.
    const mobileLoginLink = (
      <Link
        href="/login"
        aria-current={loginActive ? 'page' : undefined}
        className={`flex min-h-9 min-w-10 items-center justify-center rounded px-2 text-sm font-medium ${
          loginActive
            ? 'bg-brand-tint text-brand-strong'
            : 'text-neutral-600 hover:text-brand-strong'
        }`}
      >
        {t('session.login')}
      </Link>
    );

    return (
      <div className="flex items-center gap-2">
        <LanguageSwitcher triggerClassName="min-h-9" />

        {session ? (
          <div className="flex items-center gap-1.5">
            <Avatar displayName={session.displayName} avatarUrl={session.avatarUrl} />
            <button
              type="button"
              onClick={onRequestLogout}
              disabled={loggingOut}
              className={buttonClassName({ variant: 'ghost', className: 'min-w-10' })}
            >
              {t('session.logout')}
            </button>
          </div>
        ) : (
          mobileLoginLink
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-l border-neutral-200 pl-3 sm:gap-4 sm:pl-4">
      <Link
        href="/items/new"
        aria-current={postActive ? 'page' : undefined}
        className={buttonClassName({ variant: postActive ? 'secondary' : 'primary', size: 'sm' })}
      >
        {t('nav.create')}
      </Link>

      {session ? (
        <span className="flex items-center gap-3 text-sm text-neutral-600">
          <span className="rounded bg-brand-tint px-2 py-0.5 font-medium text-brand-strong">
            {session.displayName}
          </span>
          <button
            type="button"
            onClick={onRequestLogout}
            disabled={loggingOut}
            className={buttonClassName({ variant: 'ghost' })}
          >
            {t('session.logout')}
          </button>
        </span>
      ) : (
        loginLink
      )}

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
 * and the filter bar collapse together — the closed row is
 * `[hamburger] [logo] ... [language] [avatar/Log out]`: language and
 * account stay reachable without opening anything (`AccountCluster`'s
 * `mobile` variant). What moves into the bottom-sheet drawer is the nav
 * links (Items/My items/My claims/Admin) plus Post — Post doesn't fit on
 * the closed row alongside the logo, language switcher and avatar/Log out,
 * so it rides along with the nav links instead of forcing a second row.
 * The drawer reuses FeedFilters' shape verbatim (scrim, rounded-t-lg
 * sheet, Escape-to-close, tap-outside-to-close) rather than inventing a
 * second pattern. `md` and up is the original single-row layout,
 * unchanged.
 */
export function Header() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTitleId = useId();

  const postActive = isPathActive(pathname, '/items/new');

  // Only ever called from inside LogoutConfirmDialog's own confirm button —
  // "Log out" in either AccountCluster instance opens that dialog instead
  // (openLogoutDialog below), so a stray double-tap or an already-cleared
  // session never fires this a second time.
  async function handleLogoutConfirmed() {
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

  function openLogoutDialog() {
    setLogoutDialogOpen(true);
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
    <header className="border-b border-neutral-200 py-2 md:py-4">
      <div className={containerClassName({ className: 'flex items-center justify-between gap-4' })}>
        {/* Primary navigation cluster: hamburger (mobile only), wordmark,
            and the desktop nav row (hidden below md). Hamburger and logo
            read as one grouped cluster on mobile (gap-2); at md, where the
            hamburger disappears, this same gap instead separates the logo
            from the nav row — gap-10 there is unchanged from before this
            pass. */}
        <div className="flex items-center gap-2 md:gap-10">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('shell.menu')}
            className="-ml-2 cursor-pointer rounded p-2.5 text-neutral-700 hover:bg-neutral-100 md:hidden"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <Link href="/" className="flex items-center">
            {/* SVG source is a real vector lockup (icon + wordmark) — not
                optimized through the raster pipeline since it doesn't need
                resizing/format conversion, only CSS-driven scaling.
                `dzri-lockup-header.svg` is a header-only crop of
                `dzri-icon.svg`'s own viewBox (`0 0 1280 427`, ~193-198
                units of pure margin on every side) down to `168 68 939
                295` — a 25-unit margin on all sides, computed from the
                path data's real min/max coordinates, not eyeballed. Same
                path, same fill; only the viewBox changed, so `icon.svg`
                (favicon source, deliberately padded for its circle-crop
                legibility test) and `opengraph-image.tsx` (its own inlined
                copy of this same path, for a Satori render that can't load
                an external file) are both untouched. `width`/`height`
                match the new viewBox's own 939:295 ratio — the old
                1280:427 pair would otherwise stretch this crop. */}
            <Image
              src="/dzri-lockup-header.svg"
              alt={t('shell.wordmark')}
              width={939}
              height={295}
              unoptimized
              priority
              className="h-8 w-auto sm:h-9"
            />
          </Link>

          <div className="hidden md:block">
            <Nav variant="desktop" />
          </div>
        </div>

        {/* Desktop account / utility cluster, hidden below md. */}
        <div className="hidden md:flex">
          <AccountCluster
            variant="desktop"
            onRequestLogout={openLogoutDialog}
            loggingOut={loggingOut}
          />
        </div>

        {/* Mobile account / utility cluster — language and avatar/Log out
            (or Log in) stay reachable on the closed row itself, hidden at
            md and up. */}
        <div className="flex md:hidden">
          <AccountCluster
            variant="mobile"
            onRequestLogout={openLogoutDialog}
            loggingOut={loggingOut}
          />
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
                className="cursor-pointer text-2xl leading-none text-neutral-500"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto">
              <Nav variant="drawer" onNavigate={() => setDrawerOpen(false)} />

              <Link
                href="/items/new"
                onClick={() => setDrawerOpen(false)}
                aria-current={postActive ? 'page' : undefined}
                className={buttonClassName({
                  variant: postActive ? 'secondary' : 'primary',
                  size: 'sm',
                  className: 'w-full gap-2',
                })}
              >
                <PlusIcon className="h-4 w-4" />
                {t('nav.create')}
              </Link>
            </div>
          </div>
        </div>
      )}

      <LogoutConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        onConfirm={() => void handleLogoutConfirmed()}
      />
    </header>
  );
}
