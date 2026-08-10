import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { type FeedItem } from '@/lib/api/client';
import { getFeed } from '@/lib/items/feed';
import { getReferenceData } from '@/lib/reference';

import { FeedFilters } from './FeedFilters';
import { FeedList } from './FeedList';

import type { ItemCondition } from '@/db/schema';

const CONDITIONS: readonly ItemCondition[] = ['working', 'needs_repair', 'for_parts'];

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
 * `getItemForViewer` already established for the item detail page. Pages
 * 2+ are `FeedList`'s job: it is handed this first page as `initialItems`
 * and renders it directly (no client-side refetch), then extends the same
 * grid itself as the viewer scrolls. `FeedList` is keyed on the filter
 * string so that changing a filter — a fresh navigation, a fresh server
 * render — remounts it with clean state instead of appending page 2 of a
 * district nobody is looking at anymore onto page 1 of the one they are.
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

  // Computed once and threaded down to `FeedList` (serialized) so every
  // card's "posted ago" — this page's own and every page `loadMore` appends
  // later — reads against one frozen instant instead of each render's own
  // `new Date()`. This page has no static/ISR caching (the layout sets
  // `dynamic = 'force-dynamic'` for the whole `[locale]` segment), so this
  // is a fresh value on every real request, not a value baked into a
  // shared cached response.
  const now = new Date();

  const [feed, { districts, categories }, t] = await Promise.all([
    getFeed({ district, category, condition }),
    getReferenceData(),
    getTranslations(),
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

  const items: FeedItem[] = feed.items.map((item) => ({
    id: item.id,
    title: item.title,
    condition: item.condition,
    createdAt: item.createdAt.toISOString(),
    thumbnailUrl: item.thumbnailUrl,
    district: item.district,
    category: item.category,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      {/* The nav already reads "Items" for this page; a second visible
          heading saying the same thing adds nothing but still belongs in
          the document outline for accessibility. */}
      <h1 className="sr-only">{t('pages.feed')}</h1>

      <FeedFilters districts={districts} categories={categories} />

      {items.length === 0 ? (
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
        <FeedList
          key={`${district ?? ''}|${category ?? ''}|${condition ?? ''}`}
          initialItems={items}
          initialNextCursor={feed.nextCursor}
          initialNow={now.toISOString()}
          district={district}
          category={category}
          condition={condition}
        />
      )}
    </main>
  );
}
