import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/**
 * Catches an explicit `notFound()` call from a page that *did* match a
 * route — e.g. a future item-detail page for an id that doesn't exist —
 * so it renders nested inside `[locale]/layout.tsx`, with the header,
 * footer and a real locale to translate with.
 *
 * It does NOT catch a URL that matches no route at all (a typo'd path, a
 * stale link). Verified directly: Next resolves that case before any
 * layout can render, so it always falls through to the plain
 * `src/app/not-found.tsx`, regardless of how deep the path looks like it
 * should live under `[locale]/` — a documented Next.js limitation, not
 * something fixable from in here.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('notFound');

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-neutral-600">{t('description')}</p>
      <Link href="/" className="text-sm text-brand-strong hover:underline">
        {t('backToFeed')}
      </Link>
    </main>
  );
}
