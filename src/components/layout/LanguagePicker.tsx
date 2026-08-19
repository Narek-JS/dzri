'use client';

import { useEffect, useState } from 'react';

import * as Dialog from '@radix-ui/react-dialog';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, routing } from '@/i18n/routing';

import type { Locale } from 'next-intl';

/**
 * Set once the visitor has either picked a language or dismissed the
 * picker without picking one — either way there's nothing left to ask.
 * localStorage, not the `NEXT_LOCALE` cookie: the cookie already carries
 * whatever locale is active and gets set by every ordinary navigation
 * (see LanguageSwitcher's own comment on this), so it can't distinguish
 * "this device has seen the picker" from "the proxy's Accept-Language
 * detection happened to land here". This key is the one signal that means
 * only that.
 */
const SEEN_KEY = 'dzri-language-picker-seen';

function hasBeenSeen(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(SEEN_KEY) === '1';
}

/** Tailwind's default `md` breakpoint — matches every other `md:` class in
 * this codebase (no override in globals.css's `@theme`). */
const DESKTOP_QUERY = '(min-width: 768px)';

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

// Flag emoji, not a hand-drawn SVG — national flag colors are fixed and
// outside this app's brand-token system (BRAND.md's "no raw hex" rule is
// about the brand palette, not sidestepping it for a different kind of
// color), and emoji renders correctly with zero hex literals anywhere.
// English pairs with the US flag rather than a UK one to match the
// reference design (list.am) this component is modeled on.
const FLAG_EMOJI: Record<Locale, string> = {
  hy: '🇦🇲',
  ru: '🇷🇺',
  en: '🇺🇸',
};

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * BottomSheet's own default (`[0.5, 0.9]`, in BottomSheet.tsx) is sized for
 * FeedFilters' three fields plus a pinned footer — this sheet is just a
 * title and one row of three flag cards, which left roughly a third of the
 * sheet as dead space below the cards. A single, shorter snap point (~30%
 * less than the default 0.5) fits the actual content instead; there is
 * nothing here worth dragging up to reveal, so a second, taller point
 * would only reintroduce the same empty space.
 */
const SNAP_POINTS = [0.35];

function LanguageOptions({
  activeLocale,
  onChoose,
}: {
  activeLocale: Locale;
  onChoose: (locale: Locale) => void;
}) {
  const t = useTranslations('languageSwitcher');

  return (
    <div className="grid grid-cols-3 gap-3">
      {locales.map((code) => {
        const active = code === activeLocale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChoose(code)}
            aria-pressed={active}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
              active
                ? 'border-brand-strong bg-brand-tint'
                : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <span aria-hidden="true" className="text-4xl leading-none">
              {FLAG_EMOJI[code]}
            </span>
            <span className="text-sm font-medium text-neutral-900">{t(code)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * First-visit language picker, modeled on list.am's own (see the two
 * screenshots the brief was built from): a centered modal on desktop, a
 * bottom sheet on mobile, both showing the same three flag cards.
 *
 * Dismissing without picking — an outside click or Escape on desktop, a
 * swipe-down-past-lowest-snap-point or scrim tap on mobile — is *not* a
 * neutral no-op: `routing.defaultLocale` (hy) is forced, even if the proxy's
 * Accept-Language detection had already landed the visitor on /ru or /en.
 * That's the brief's explicit rule ("if it will close ... the default
 * language should be Armenian"), and it only has teeth when it actively
 * overrides an auto-detected non-default locale — if dismissing merely left
 * whatever locale Accept-Language guessed in place, "default to Armenian"
 * would be meaningless for exactly the visitors it's meant to apply to.
 *
 * Picking a card, by contrast, is a real choice and is left alone
 * regardless of what it is — including hy, which is a no-op navigation but
 * still marks the picker seen.
 */
export function LanguagePicker() {
  const t = useTranslations('languagePicker');
  const locale = useLocale();
  const activeLocale = isLocale(locale) ? locale : routing.defaultLocale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Lazy initializer, not an effect: this only needs to run once, reading a
  // value React doesn't otherwise own (localStorage), which is exactly
  // what a lazy `useState` initializer is for — no cascading extra render
  // the way `useEffect(() => setOpen(true))` would need on every mount.
  // `hasBeenSeen()` reports `true` (closed) when `window` doesn't exist
  // yet, matching Dialog/BottomSheet's own portal-rendered content, which
  // has no server-rendered DOM to hydrate regardless of `open` — see the
  // portal note below.
  const [open, setOpen] = useState(() => !hasBeenSeen());

  // Which of the two presentations is actually mounted. Both Dialog and
  // BottomSheet build on Radix's modal machinery, and each one's own
  // mount effect calls `hideOthers()` (see BottomSheet.tsx's comment on
  // exactly this) — walking up to `document.body` and marking every
  // *other* top-level sibling `aria-hidden` and inert. Rendering both at
  // once with the same `open` state (relying only on `md:hidden` CSS to
  // pick one visually, the pattern FeedFilters/Header use for a row vs. a
  // sheet) breaks here because neither of those existing pairs is two
  // simultaneously-modal Roots — CSS hides one's *pixels*, but each
  // still runs its own `hideOthers()` against the other's real DOM node,
  // and whichever mounts second wins, leaving the visible one unclickable.
  // Confirmed by hand: at a desktop width, the flag buttons stopped
  // receiving clicks, intercepted by the *other* (CSS-hidden) root's
  // overlay. Reading the viewport in JS and mounting only the matching
  // one avoids the conflict outright, at the (accepted) cost of not
  // live-adapting if the window is resized past `md` while this
  // first-visit-only picker happens to still be open.
  const [isDesktop, setIsDesktop] = useState(() => isDesktopViewport());

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    function handleChange() {
      setIsDesktop(query.matches);
    }
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  function markSeen() {
    window.localStorage.setItem(SEEN_KEY, '1');
  }

  function navigateTo(target: Locale) {
    if (target === activeLocale) return;
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: target });
  }

  function handleChoose(target: Locale) {
    navigateTo(target);
    markSeen();
    setOpen(false);
  }

  /** Only fires for user-driven dismissal — see BottomSheet/Dialog's own
   * `onOpenChange` contract. Programmatic closes from `handleChoose` above
   * set `open` directly and never reach this. */
  function handleDismiss(next: boolean) {
    if (!next) {
      navigateTo(routing.defaultLocale);
      markSeen();
    }
    setOpen(next);
  }

  if (isDesktop) {
    return (
      <Dialog.Root open={open} onOpenChange={handleDismiss}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-900/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
            <Dialog.Title className="text-center text-lg font-semibold text-neutral-900">
              {t('title')}
            </Dialog.Title>
            <div className="mt-6">
              <LanguageOptions activeLocale={activeLocale} onChoose={handleChoose} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleDismiss}
      title={t('title')}
      snapPoints={SNAP_POINTS}
    >
      <LanguageOptions activeLocale={activeLocale} onChoose={handleChoose} />
    </BottomSheet>
  );
}
