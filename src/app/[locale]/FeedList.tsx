'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { ApiClientError, api, apiErrorMessageKey, type FeedItem } from '@/lib/api/client';
import { relativeTimeMessage } from '@/lib/relativeTime';

import { ItemCard } from './ItemCard';

import type { ApiErrorCode } from '@/lib/http';
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
 * `FeedItem.titleHy`/`titleRu`/`titleEn` are all guaranteed non-null (the
 * feed is only ever `active` items — see that type's own doc comment), so
 * this is a plain three-way pick, the same shape as `localizedName` above.
 */
function localizedTitle(item: FeedItem, locale: string): string {
  if (locale === 'ru') return item.titleRu;
  if (locale === 'en') return item.titleEn;
  return item.titleHy;
}

/**
 * How early the sentinel triggers a load, before it's actually on screen —
 * so the next page is usually there by the time a scroller reaches the
 * bottom of the current one, rather than after.
 */
const SENTINEL_ROOT_MARGIN = '600px';

type Status = 'idle' | 'loading' | 'error';

type Props = {
  /** Already rendered by the server (`[locale]/page.tsx`) — never refetched here. */
  initialItems: FeedItem[];
  initialNextCursor: string | null;
  /**
   * ISO timestamp, computed once by `page.tsx` at request time. Every
   * card's "posted ago" — first page and every page `loadMore` appends —
   * is measured against this same instant. See relativeTime.ts for why a
   * card can't just ask `Intl.RelativeTimeFormat`/`useFormatter` for this,
   * and this component's `now` state below for why it can't call
   * `new Date()` per render either.
   */
  initialNow: string;
  district?: string;
  category?: string;
  condition?: ItemCondition;
};

/**
 * Pages 2+ of the feed, appended below the server-rendered first page.
 * `page.tsx` mounts this keyed on the filter string, so a filter change
 * remounts it fresh with a new `initialItems`/`initialNextCursor` rather
 * than this component ever needing to reset its own state mid-life.
 *
 * A `ref` (not state) tracks the cursor currently in flight. State updates
 * from a fetch that started under a fast scroll can still be pending when
 * the `IntersectionObserver` fires again for the same cursor — a ref reads
 * synchronously inside that callback where `status` state cannot be
 * trusted not to be stale, and it's what stops that from becoming a
 * double-load (PART 3).
 */
export function FeedList({
  initialItems,
  initialNextCursor,
  initialNow,
  district,
  category,
  condition,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();

  // Lazy-initialized once from the server-sent `initialNow` and never
  // updated afterward — the SSR pass and the hydration pass both start
  // from this same serialized value, so there's no server/client clock
  // drift for a card's bucket to disagree about, and no drift between
  // cards on this page and cards `loadMore` appends later either.
  const [now] = useState(() => new Date(initialNow));

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [status, setStatus] = useState<Status>('idle');
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  const inFlightCursor = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (cursor === null || inFlightCursor.current === cursor) return;

    inFlightCursor.current = cursor;
    setStatus('loading');
    setErrorCode(null);
    try {
      const response = await api.items.feed({ district, category, condition, cursor });
      setItems((previous) => [...previous, ...response.items]);
      setCursor(response.nextCursor);
      setStatus('idle');
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'INTERNAL');
      setStatus('error');
    } finally {
      inFlightCursor.current = null;
    }
  }, [cursor, district, category, condition]);

  // No scroll-event listener (PART 3) — the sentinel is observed directly,
  // and the effect re-subscribes whenever the cursor (and so `loadMore`)
  // changes. Once `cursor` is `null` the sentinel is unmounted by the JSX
  // below, this effect tears down its observer, and nothing observes
  // anything again: that is "the sentinel stops observing."
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || cursor === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {items.map((item) => {
          const postedAgo = relativeTimeMessage(new Date(item.createdAt), now);
          const title = localizedTitle(item, locale);

          return (
            <ItemCard
              key={item.id}
              item={item}
              title={title}
              thumbnailAlt={t('itemDetail.gallery.photoAlt', { title })}
              conditionLabel={t(CONDITION_LABEL_KEYS[item.condition] as Parameters<typeof t>[0])}
              districtName={localizedName(item.district, locale)}
              postedAgo={t(postedAgo.key as Parameters<typeof t>[0], postedAgo.values)}
            />
          );
        })}
      </div>

      {cursor !== null && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-3 py-2">
          {status === 'error' ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-red-700" role="alert">
                {t(apiErrorMessageKey(errorCode ?? 'INTERNAL') as Parameters<typeof t>[0])}
              </p>
              <button
                type="button"
                onClick={() => void loadMore()}
                className="cursor-pointer rounded border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                {t('error.retry')}
              </button>
            </div>
          ) : (
            // Doubles as the keyboard/screen-reader fallback (PART 3): the
            // IntersectionObserver above fires this same handler on scroll,
            // but the button is always present, not only when the observer
            // fails, so anyone who can't or doesn't scroll always has a
            // reachable, focusable way to load the next page.
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={status === 'loading'}
              aria-busy={status === 'loading'}
              className="cursor-pointer rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'loading' ? t('feed.loadingMore') : t('feed.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
