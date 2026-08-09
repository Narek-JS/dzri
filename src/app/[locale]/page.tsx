import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { getFeed } from '@/lib/items/feed';

import { ItemCard } from './ItemCard';

import type { ItemCondition } from '@/db/schema';

const CONDITION_LABEL_KEYS: Record<ItemCondition, string> = {
  working: 'createItem.condition.working',
  needs_repair: 'createItem.condition.needsRepair',
  for_parts: 'createItem.condition.forParts',
};

type LocalizedRef = { nameHy: string; nameRu: string; nameEn: string };

function localizedName(ref: LocalizedRef, locale: string): string {
  if (locale === 'ru') return ref.nameRu;
  if (locale === 'en') return ref.nameEn;
  return ref.nameHy;
}

/**
 * The feed: the home page, and the first thing anyone sees. Server
 * component — the first page is fetched here, server-side, so the page is
 * indexable and paints without a client waterfall.
 *
 * `getFeed` (src/lib/items/feed.ts) is the exact query `GET /api/items`
 * runs, called directly rather than over HTTP — the same split
 * `getItemForViewer` already established for the item detail page.
 *
 * Filters and infinite scroll land in later commits; this is deliberately
 * just the first page, unfiltered, so the base render is verifiable on its
 * own before either is layered on.
 */
export default async function FeedPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const [feed, t, format] = await Promise.all([getFeed({}), getTranslations(), getFormatter()]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      {/* The nav already reads "Items" for this page; a second visible
          heading saying the same thing adds nothing but still belongs in
          the document outline for accessibility. */}
      <h1 className="sr-only">{t('pages.feed')}</h1>

      {feed.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-lg font-medium text-neutral-800">{t('feed.empty.noItems.title')}</p>
          <p className="text-sm text-neutral-600">{t('feed.empty.noItems.description')}</p>
          <Link
            href="/items/new"
            className="mt-2 rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900"
          >
            {t('feed.empty.noItems.cta')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {feed.items.map((item) => (
            <ItemCard
              key={item.id}
              item={{ ...item, createdAt: item.createdAt.toISOString() }}
              thumbnailAlt={t('itemDetail.gallery.photoAlt', { title: item.title })}
              conditionLabel={t(CONDITION_LABEL_KEYS[item.condition] as Parameters<typeof t>[0])}
              districtName={localizedName(item.district, locale)}
              postedAgo={format.relativeTime(item.createdAt, new Date())}
            />
          ))}
        </div>
      )}
    </main>
  );
}
