import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type LocaleParams, resolveLocale } from '@/i18n/params';

/**
 * The feed. Placeholder only — no data fetching in this task.
 *
 * `locale` is not re-validated here: `[locale]/layout.tsx` already calls
 * `notFound()` for anything outside `routing.locales`, and Next renders
 * that layout before this page, so an invalid segment never reaches it.
 */
export default async function FeedPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('pages');

  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-2xl font-semibold">{t('feed')}</h1>
    </main>
  );
}
