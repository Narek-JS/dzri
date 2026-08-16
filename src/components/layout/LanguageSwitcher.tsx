'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales } from '@/i18n/routing';

function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M10 3C13.5 3 13.5 17 10 17C6.5 17 6.5 3 10 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isLocale(value: string): value is (typeof locales)[number] {
  return (locales as readonly string[]).includes(value);
}

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

  function switchTo(value: string) {
    if (!isLocale(value)) return;
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: value });
  }

  return (
    <Select
      variant="compact"
      value={locale}
      onValueChange={switchTo}
      aria-label={t('label')}
      triggerIcon={<GlobeIcon className="h-4 w-4 shrink-0 text-neutral-500" />}
      triggerLabel={t(`short.${locale}`)}
    >
      {locales.map((code) => (
        <Select.Item key={code} value={code}>
          {t(code)}
        </Select.Item>
      ))}
    </Select>
  );
}
