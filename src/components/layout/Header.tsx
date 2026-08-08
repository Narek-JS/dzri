'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
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
          <span className="text-sm text-neutral-600">
            {t('session.signedInAs', { name: session.displayName })}
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
