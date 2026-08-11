'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';

import { MyItemRow } from './MyItemRow';

import type { MyItem } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Status = 'idle' | 'loading' | 'error';

type Props = {
  /** Already rendered by the server (`page.tsx`) — never refetched on mount. */
  initialItems: MyItem[];
  initialNextCursor: string | null;
  /**
   * ISO timestamp, computed once by `page.tsx` at request time. Every row's
   * "posted N days ago" — this first page and every page `loadMore` appends —
   * is measured against this same instant. See relativeTime.ts for why a row
   * can't ask `Intl.RelativeTimeFormat`/`useFormatter` for this, and `now`
   * below for why it can't call `new Date()` per render either.
   */
  initialNow: string;
};

/**
 * The giver's list, client-side: one list, newest first, every status mixed
 * together, extended a page at a time from `GET /api/items/mine`.
 *
 * A single flat list on purpose — this is a history. A listing that was given
 * away, expired or taken down keeps its place in it with its new status rather
 * than vanishing, so "what have I posted and what came of it" stays answerable
 * by reading top to bottom.
 *
 * Pagination is the feed's, in miniature: a cursor, one page of 20 at a time,
 * and a plain button rather than the feed's `IntersectionObserver`. This list
 * is short (a person's own listings, not a public feed) and always reachable
 * by keyboard, so there is nothing a scroll sentinel buys here.
 */
export function MyItemsList({ initialItems, initialNextCursor, initialNow }: Props) {
  const t = useTranslations();

  // Lazy-initialized once from the server-sent `initialNow` and never
  // updated — the SSR pass and the hydration pass start from the same
  // serialized value, so there is no clock drift for a row's bucket to
  // disagree about, on this page or on pages appended later.
  const [now] = useState(() => new Date(initialNow));

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [status, setStatus] = useState<Status>('idle');
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  const loadMore = useCallback(async () => {
    if (cursor === null || status === 'loading') return;

    setStatus('loading');
    setErrorCode(null);
    try {
      const response = await api.items.mine({ cursor });
      setItems((previous) => [...previous, ...response.items]);
      setCursor(response.nextCursor);
      setStatus('idle');
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'INTERNAL');
      setStatus('error');
    }
  }, [cursor, status]);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <MyItemRow key={item.id} item={item} now={now} />
        ))}
      </ul>

      {cursor !== null && (
        <div className="flex flex-col items-center gap-2 py-2">
          {status === 'error' && (
            <p className="text-sm text-red-700" role="alert">
              {t(apiErrorMessageKey(errorCode ?? 'INTERNAL') as Parameters<typeof t>[0])}
            </p>
          )}
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={status === 'loading'}
            aria-busy={status === 'loading'}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {status === 'loading'
              ? t('myItems.loadingMore')
              : status === 'error'
                ? t('error.retry')
                : t('myItems.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
