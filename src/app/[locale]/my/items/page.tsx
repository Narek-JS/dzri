import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type LocaleParams, resolveLocale } from '@/i18n/params';

/** The caller's own listings. Placeholder only. */
export default async function MyItemsPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('pages');

  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-2xl font-semibold">{t('myItems')}</h1>
    </main>
  );
}
