'use client';

import { useState } from 'react';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
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
 * that stays reachable without opening the mobile drawer, at every
 * viewport. A clickable circular Avatar opens a small Radix DropdownMenu
 * with "Post", "Account" and "Log out" — one interaction, identical at
 * every width, rather than a separate inline row of links on desktop.
 * Post is also reachable as a full-width CTA inside the mobile drawer
 * (Header's `BottomSheet`, below) for anyone who opens it via the
 * hamburger instead; desktop keeps its own separate `Nav` row for
 * Items/My items/My claims/Admin, so this cluster is only ever the
 * identity/utility slot, never primary navigation.
 *
 * Rendered once by Header, unconditionally — there is no desktop/mobile
 * split for this cluster any more. Does not call the logout endpoint
 * directly: selecting "Log out" only opens the confirm dialog Header
 * renders once; the actual request and its pending state live there too.
 */
function AccountCluster({
  onRequestLogout,
  loggingOut,
}: {
  onRequestLogout: () => void;
  loggingOut: boolean;
}) {
  const t = useTranslations();
  const session = useSession();
  const pathname = usePathname();

  const postActive = isPathActive(pathname, '/items/new');
  const loginActive = isPathActive(pathname, '/login');
  const accountActive = isPathActive(pathname, '/my/account');

  // `min-h-9` floors the tap target at 36px — this link has no dropdown to
  // lean on for sizing, so it carries its own minimum at every width.
  const loginLink = (
    <Link
      href="/login"
      aria-current={loginActive ? 'page' : undefined}
      className={`flex min-h-9 min-w-10 items-center justify-center rounded px-2 text-sm font-medium ${
        loginActive ? 'bg-brand-tint text-brand-strong' : 'text-neutral-600 hover:text-brand-strong'
      }`}
    >
      {t('session.login')}
    </Link>
  );

  return (
    <div className="flex items-center gap-2 md:gap-4 md:border-l md:border-neutral-200 md:pl-4">
      {session ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            {/* Icon-only trigger, same shape as the hamburger/drawer-close
                buttons above: a bare `cursor-pointer` rather than
                `buttonClassName`, whose variants all add visible chrome
                (background, underline) that fights the circular avatar
                they'd be wrapping. */}
            <button
              type="button"
              aria-label={t('session.accountMenu')}
              className="cursor-pointer rounded-full"
            >
              <Avatar displayName={session.displayName} avatarUrl={session.avatarUrl} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              collisionPadding={10}
              // "Log out" opens the AlertDialog from inside this menu's own
              // onSelect — Radix's default close behavior would otherwise
              // return focus to the avatar trigger right after, racing the
              // AlertDialog's own auto-focus and sometimes winning it back.
              // Same guard Combobox.tsx already applies to its Popover.Content
              // for the equivalent reason.
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="z-[100] flex min-w-36 flex-col gap-1 overflow-hidden rounded-md border border-neutral-200 bg-white px-1 pt-2 pb-1 shadow-lg"
            >
              {/* Filled, brand-colored, plus-icon button — reads as the
                  primary action here rather than a fourth plain menu row.
                  `data-[highlighted]` (Radix's keyboard-nav state) gets its
                  own brightness shift since the fill means the ordinary
                  bg-brand-tint highlight treatment doesn't apply cleanly on
                  top of it.
                  `w-full justify-start` overrides buttonClassName's default
                  centered content: the parent `DropdownMenu.Content` is
                  `flex-col`, whose default `align-items: stretch` already
                  stretches this `Item` to the full menu width, but the
                  `Link` inside it does not fill that width on its own — a
                  content-hugging button sits flush in the top-left corner
                  of its now-empty row instead of spanning it. `w-full` and
                  the matching `px-3` (same as "Account"/"Log out" below)
                  fix both: full width, and the "+" icon starts at the same
                  left inset their text does. Every size-related class below
                  is `!`-prefixed since it must win over the `md`-size
                  classes `buttonClassName` bakes in by default, which are
                  equal-specificity plain utilities that wouldn't otherwise
                  reliably lose to these. */}
              <DropdownMenu.Item asChild>
                <Link
                  href="/items/new"
                  className={buttonClassName({
                    variant: postActive ? 'secondary' : 'primary',
                    className:
                      '!min-h-0 w-full justify-start gap-1 !px-3 !py-2 !text-sm outline-none select-none data-[highlighted]:brightness-95',
                  })}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {t('nav.create')}
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link
                  href="/my/account"
                  aria-current={accountActive ? 'page' : undefined}
                  className={buttonClassName({
                    variant: 'ghost',
                    className:
                      'w-full justify-start px-3 py-2 outline-none select-none data-[highlighted]:underline',
                  })}
                >
                  {t('session.account')}
                </Link>
              </DropdownMenu.Item>
              {/* Only opens the confirm dialog Header already renders —
                  see the doc comment above AccountCluster. Radix closes
                  the menu itself once onSelect returns, so this doesn't
                  need to call setOpen/close anything by hand.
                  `buttonClassName({ variant: 'ghost' })` is the same
                  subdued text style "Account" above uses — deliberately
                  unfilled so it reads as secondary next to Post.
                  `data-[disabled]` (not buttonClassName's own
                  `disabled:` variants, which target the native
                  `:disabled` pseudo-class) is what actually reflects
                  the `disabled` prop here: this Item has no `asChild`
                  wrapping a real `<button>`, so Radix sets its own
                  data attribute instead of the DOM one. */}
              <DropdownMenu.Item
                onSelect={onRequestLogout}
                disabled={loggingOut}
                className={buttonClassName({
                  variant: 'ghost',
                  className:
                    'w-full justify-start px-3 py-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:underline',
                })}
              >
                {t('session.logout')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        loginLink
      )}

      <LanguageSwitcher triggerClassName="min-h-9" />
    </div>
  );
}

/**
 * Wordmark, nav, a signed-in-state slot, and the language switcher.
 * `useSession()` reads the value `[locale]/layout.tsx` put in
 * `SessionProvider` — no fetch here.
 *
 * The closed row is `[hamburger, md-hidden] [logo] [nav, hidden below md]
 * ... [avatar or Log in] [language]` at every width: account and language
 * stay reachable without opening anything (`AccountCluster`). Tapping the
 * avatar opens a small dropdown (Post, Account, Log out) rather than a
 * standalone row of links — the same interaction below `md` and at `md`
 * and up now, where it used to differ. Below `md` — the same breakpoint
 * FeedFilters switches at, so the header and the filter bar collapse
 * together — the hamburger opens a bottom sheet with the nav links (Items/
 * My items/My claims/Admin) plus a second, full-width Post CTA: the row's
 * own avatar dropdown already reaches Post without opening the sheet, but
 * the sheet keeps its own copy alongside the nav links for anyone who
 * opens it via the hamburger instead. The sheet is the same shared
 * `BottomSheet` (vaul) FeedFilters uses below `md`, rather than a second
 * hand-rolled drawer.
 */
export function Header() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const postActive = isPathActive(pathname, '/items/new');

  // Only ever called from inside LogoutConfirmDialog's own confirm button —
  // "Log out" in AccountCluster opens that dialog instead (openLogoutDialog
  // below), so a stray double-tap or an already-cleared session never fires
  // this a second time.
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

        {/* Account / utility cluster — language and avatar (or Log in)
            stay reachable on the closed row itself, at every width. */}
        <AccountCluster onRequestLogout={openLogoutDialog} loggingOut={loggingOut} />
      </div>

      <BottomSheet
        snapPoints={[0.42, 0.9]}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={t('shell.menu')}
      >
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
      </BottomSheet>

      <LogoutConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        onConfirm={() => void handleLogoutConfirmed()}
      />
    </header>
  );
}
