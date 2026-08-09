import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { getFeed } from '@/lib/items/feed';
import { getReferenceData } from '@/lib/reference';

import { FeedFilters } from './FeedFilters';
import { ItemCard } from './ItemCard';

import type { ItemCondition } from '@/db/schema';

const CONDITIONS: readonly ItemCondition[] = ['working', 'needs_repair', 'for_parts'];
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
 * A URL search param can be a string, a repeated-key array, or absent.
 * Collapsed to one string or `undefined` — and an empty string (`?district=`)
 * is treated the same as absent, matching what `<select>`'s "all" option
 * writes back into the URL (see `FeedFilters`).
 */
function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * `district`/`category` degrade to "matches nothing" server-side for an
 * unknown slug (API.md), but `condition` is a closed enum with no such
 * fallback in the query itself — so a stale or hand-edited `?condition=`
 * is normalized to absent here rather than reaching `getFeed` at all. A
 * URL is user-editable; PART 2 is explicit that it must never break the
 * page.
 */
function isItemCondition(value: string | undefined): value is ItemCondition {
  return value !== undefined && (CONDITIONS as readonly string[]).includes(value);
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The feed: the home page, and the first thing anyone sees. Server
 * component — filters come from `searchParams`, and both the feed's first
 * page and the reference data the filter panel needs are fetched here,
 * server-side, so the page is indexable and paints without a client
 * waterfall.
 *
 * `getFeed` (src/lib/items/feed.ts) is the exact query `GET /api/items`
 * runs, called directly rather than over HTTP — the same split
 * `getItemForViewer` already established for the item detail page.
 *
 * Infinite scroll lands in the next commit; this is still just the first
 * page, now filterable.
 */
export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<LocaleParams>;
  searchParams: Promise<SearchParams>;
}) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const sp = await searchParams;
  const district = firstParam(sp.district);
  const category = firstParam(sp.category);
  const conditionParam = firstParam(sp.condition);
  const condition = isItemCondition(conditionParam) ? conditionParam : undefined;

  const [feed, { districts, categories }, t, format] = await Promise.all([
    getFeed({ district, category, condition }),
    getReferenceData(),
    getTranslations(),
    getFormatter(),
  ]);

  // "No items at all" (nobody has filtered anything, and the feed is
  // still empty) and "no items matching the filters" (the feed has items,
  // just not ones that fit this combination) are different situations
  // that read differently — distinguished here by whether a filter is
  // active, without a second query: an active filter is why this page
  // came back empty far more often than the whole platform being empty,
  // and the copy for the filtered case ("try a different district") stays
  // true regardless.
  const hasActiveFilter =
    district !== undefined || category !== undefined || condition !== undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      {/* The nav already reads "Items" for this page; a second visible
          heading saying the same thing adds nothing but still belongs in
          the document outline for accessibility. */}
      <h1 className="sr-only">{t('pages.feed')}</h1>

      <FeedFilters districts={districts} categories={categories} />

      {feed.items.length === 0 ? (
        hasActiveFilter ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-lg font-medium text-neutral-800">
              {t('feed.empty.noMatches.title')}
            </p>
            <p className="text-sm text-neutral-600">{t('feed.empty.noMatches.description')}</p>
            <Link href="/" className="mt-2 text-sm text-brand-strong hover:underline">
              {t('feed.empty.noMatches.clear')}
            </Link>
          </div>
        ) : (
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
        )
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
