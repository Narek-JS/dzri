'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
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
 * What a deleted listing looks like, applied locally rather than refetched.
 *
 * Three things move, all of them mirroring what `removeItem` does in the same
 * transaction (src/lib/items/remove.ts): the status becomes `removed`, every
 * pending claim on the item is rejected — so `pendingClaimCount` drops to zero
 * and the row stops asking for a decision that can no longer be made — and
 * `rejection_reason` is cleared, because the `rejection_reason_matches_status`
 * check constraint forbids a non-rejected item from carrying one.
 *
 * `claimCount` is deliberately untouched. It counts every claim ever, whatever
 * became of it, and rejecting those people does not unmake the fact that they
 * asked: the claims page still has their history on it, and the row still
 * links there.
 */
function asRemoved(item: MyItem): MyItem {
  return { ...item, status: 'removed', rejectionReason: null, pendingClaimCount: 0 };
}

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

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, ApiErrorCode>>>({});
  const [refreshedNotice, setRefreshedNotice] = useState(false);

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

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * INVALID_STATUS_TRANSITION means the state moved under us — a claim was
   * approved and the item is now `reserved`, the sweep expired it, or another
   * tab already deleted it. Not an error to show: the answer is the current
   * state, so this replaces the list with the server's, exactly as
   * `ClaimsBoard` and `MyClaimsList` do.
   *
   * The refetch is page 1 with no cursor, so a list the giver had paged
   * further into collapses back to the newest 20 with the "Load more" button
   * restored. Better than merging a fresh first page into stale later ones
   * whose contents may have shifted rows across the page boundary in the
   * meantime — the notice says the list changed, and it has.
   */
  const refreshFromServer = useCallback(async () => {
    try {
      const response = await api.items.mine();
      setItems(response.items);
      setCursor(response.nextCursor);
      setRefreshedNotice(true);
    } catch {
      // The list on screen is still whatever it was; nothing better to show.
    }
  }, []);

  const handleDelete = useCallback(
    async (item: MyItem) => {
      setRowErrors((previous) => {
        if (!(item.id in previous)) return previous;
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      setBusy(item.id, true);
      try {
        await api.items.remove(item.id);
        // The row STAYS, carrying its new status — this page is a history, and
        // a listing that vanished on delete would leave a hole in it.
        setItems((previous) => previous.map((i) => (i.id === item.id ? asRemoved(i) : i)));
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
        if (code === 'INVALID_STATUS_TRANSITION') {
          await refreshFromServer();
        } else {
          setRowErrors((previous) => ({ ...previous, [item.id]: code }));
        }
      } finally {
        setBusy(item.id, false);
      }
    },
    [refreshFromServer, setBusy],
  );

  return (
    <div className="flex flex-col gap-4">
      {refreshedNotice && (
        <Notice
          tone="neutral"
          size="compact"
          role="status"
          className="flex items-center justify-between gap-3 text-sm text-neutral-700"
        >
          <span>{t('myItems.refreshed')}</span>
          <button
            type="button"
            onClick={() => setRefreshedNotice(false)}
            aria-label={t('myItems.dismiss')}
            className="text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </Notice>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <MyItemRow
            key={item.id}
            item={item}
            now={now}
            busy={busyIds.has(item.id)}
            errorCode={rowErrors[item.id] ?? null}
            onDelete={() => void handleDelete(item)}
          />
        ))}
      </ul>

      {cursor !== null && (
        <div className="flex flex-col items-center gap-2 py-2">
          {status === 'error' && (
            <p className="text-sm text-red-700" role="alert">
              {t(apiErrorMessageKey(errorCode ?? 'INTERNAL') as Parameters<typeof t>[0])}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMore()}
            disabled={status === 'loading'}
            aria-busy={status === 'loading'}
          >
            {status === 'loading'
              ? t('myItems.loadingMore')
              : status === 'error'
                ? t('error.retry')
                : t('myItems.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
