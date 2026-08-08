'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/sessionContext';

import { LanguageSwitcher } from './LanguageSwitcher';
import { Nav } from './Nav';

/**
 * Wordmark, nav, a signed-in-state slot, and the language switcher.
 * `useSession()` reads the value `[locale]/layout.tsx` put in
 * `SessionProvider` — no fetch here.
 */
export function Header() {
  const t = useTranslations();
  const session = useSession();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="flex items-center justify-between gap-6 px-6 py-4">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-wordmark text-xl text-brand-strong lowercase">
          {t('shell.wordmark')}
        </Link>
        <Nav />
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/items/new"
          // BRAND.md: a filled brand-orange fill carries near-black text,
          // never white — neutral-900 is a built-in Tailwind token, not a
          // raw hex, so it doesn't trip the no-raw-hex lint rule.
          className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-neutral-900"
        >
          {t('nav.create')}
        </Link>

        {session ? (
          <span className="flex items-center gap-2 text-sm text-neutral-600">
            {t('session.signedInAs', { name: session.displayName })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-brand-strong hover:underline disabled:opacity-50"
            >
              {t('session.logout')}
            </button>
          </span>
        ) : (
          <Link href="/login" className="text-sm hover:text-brand-strong">
            {t('session.login')}
          </Link>
        )}

        <LanguageSwitcher />
      </div>
    </header>
  );
}
