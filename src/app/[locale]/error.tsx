'use client';

import { useTranslations } from 'next-intl';

/**
 * Error boundaries must be Client Components (Next's own requirement) —
 * this one still renders inside `[locale]/layout.tsx`'s tree, so
 * `useTranslations` has a `NextIntlClientProvider` to read from. Compare
 * `src/app/global-error.tsx`, which replaces that tree entirely and can't
 * assume any of this.
 */
export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('error');

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-neutral-600">{t('description')}</p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded bg-brand px-3 py-1.5 text-sm font-medium text-neutral-900"
      >
        {t('retry')}
      </button>
    </main>
  );
}
