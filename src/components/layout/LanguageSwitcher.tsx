'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { usePathname, useRouter } from '@/i18n/navigation';
import { locales } from '@/i18n/routing';

/**
 * Switches locale, preserving the current path and query. The
 * `NEXT_LOCALE` cookie is set by the proxy the moment it processes the
 * resulting navigation (`localeCookie` defaults to on in routing.ts) —
 * nothing here writes it directly.
 */
export function LanguageSwitcher() {
  const t = useTranslations('languageSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTo(nextLocale: (typeof locales)[number]) {
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: nextLocale });
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="flex items-center gap-0.5 rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-sm"
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-current={code === locale ? 'true' : undefined}
          className={
            code === locale
              ? 'rounded bg-brand-tint px-2 py-1 font-medium text-brand-strong'
              : 'rounded px-2 py-1 text-neutral-500 hover:text-neutral-900'
          }
        >
          {t(code)}
        </button>
      ))}
    </div>
  );
}
