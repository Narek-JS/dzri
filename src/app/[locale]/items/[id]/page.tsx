import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type LocaleParams, resolveLocale } from '@/i18n/params';

/** Item detail. Placeholder only — no data fetching in this task. */
export default async function ItemDetailPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('pages');

  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-2xl font-semibold">{t('itemDetail')}</h1>
    </main>
  );
}
