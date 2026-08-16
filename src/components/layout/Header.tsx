'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { buttonClassName } from '@/components/ui/Button';
import { containerClassName } from '@/components/ui/Container';
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
    <header className="border-b border-neutral-200 py-4">
      <div
        className={containerClassName({
          className: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:gap-x-10',
        })}
      >
        {/* Primary navigation cluster: wordmark plus the content links. */}
        <div className="flex items-center gap-4 sm:gap-10">
          <Link href="/" className="font-wordmark text-xl text-brand-strong lowercase">
            {t('shell.wordmark')}
          </Link>
          <Nav />
        </div>

        {/* Account / utility cluster, set off from primary nav by a rule so
            the header doesn't read as one undifferentiated row. */}
        <div className="flex items-center gap-3 border-l border-neutral-200 pl-3 sm:gap-4 sm:pl-4">
          <Link href="/items/new" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
            {t('nav.create')}
          </Link>

          {session ? (
            <span className="flex items-center gap-3 text-sm text-neutral-600">
              <span className="rounded bg-brand-tint px-2 py-0.5 font-medium text-brand-strong">
                {session.displayName}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={buttonClassName({ variant: 'ghost' })}
              >
                {t('session.logout')}
              </button>
            </span>
          ) : (
            <Link href="/login" className="text-sm text-neutral-600 hover:text-brand-strong">
              {t('session.login')}
            </Link>
          )}

          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
