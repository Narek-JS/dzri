'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';

import { PendingItemCard } from './PendingItemCard';

import type { ApiErrorCode } from '@/lib/http';
import type { PendingItem } from '@/lib/api/client';

type Props = {
  /** Already rendered by the server (`page.tsx`) — never refetched here. */
  initialItems: PendingItem[];
  initialNextCursor: string | null;
};

/** One item leaving the queue because someone else already reviewed it. */
type AlreadyReviewedNotice = { key: string; title: string };

/**
 * The moderation work queue, client-side: pagination, and per-item
 * approve/reject with the optimistic-removal behavior PART 3 asks for.
 * `page.tsx` fetches the first page server-side — this component only
 * extends it, the same split `FeedList` uses for the public feed.
 *
 * Approve and reject are both handled here rather than inside
 * `PendingItemCard` because "leaves the queue immediately" is a fact about
 * this list, not about one card: the card only asks to be removed, and
 * this component is what removes it, puts it back on a real failure, and
 * decides an `INVALID_STATUS_TRANSITION` means someone else already
 * reviewed it rather than a normal error.
 */
export function ModerationQueue({ initialItems, initialNextCursor }: Props) {
  const t = useTranslations();

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<ApiErrorCode | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [itemErrors, setItemErrors] = useState<Readonly<Record<string, ApiErrorCode>>>({});
  const [notices, setNotices] = useState<readonly AlreadyReviewedNotice[]>([]);

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearItemError = useCallback((id: string) => {
    setItemErrors((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  /** Re-inserts an item that failed to review, oldest-first as the queue requires. */
  const restoreItem = useCallback((item: PendingItem) => {
    setItems((previous) => {
      if (previous.some((existing) => existing.id === item.id)) return previous;
      const insertAt = previous.findIndex((existing) => existing.createdAt > item.createdAt);
      const next = [...previous];
      next.splice(insertAt === -1 ? next.length : insertAt, 0, item);
      return next;
    });
  }, []);

  const review = useCallback(
    async (item: PendingItem, action: 'approve' | 'reject', reason?: string) => {
      clearItemError(item.id);
      // Optimistic: the row leaves the queue the instant the tap lands.
      setItems((previous) => previous.filter((existing) => existing.id !== item.id));
      setBusy(item.id, true);

      try {
        if (action === 'approve') {
          await api.admin.approveItem(item.id);
        } else {
          await api.admin.rejectItem(item.id, { reason: reason ?? '' });
        }
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';

        if (code === 'INVALID_STATUS_TRANSITION') {
          // Someone else already reviewed it, or this was a double-click —
          // either way the row's absence from the queue is correct, so it
          // stays gone. A quiet, dismissible notice explains why, rather
          // than surfacing this as a failure on a row that no longer exists.
          setNotices((previous) => [
            ...previous,
            { key: `${item.id}-${Date.now()}`, title: item.title },
          ]);
        } else {
          restoreItem(item);
          setItemErrors((previous) => ({ ...previous, [item.id]: code }));
        }
      } finally {
        setBusy(item.id, false);
      }
    },
    [clearItemError, restoreItem, setBusy],
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;

    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await api.admin.pendingItems({ cursor });
      setItems((previous) => [...previous, ...response.items]);
      setCursor(response.nextCursor);
    } catch (error) {
      setLoadMoreError(error instanceof ApiClientError ? error.code : 'INTERNAL');
    } finally {
      setLoadingMore(false);
    }
  }

  function dismissNotice(key: string) {
    setNotices((previous) => previous.filter((notice) => notice.key !== key));
  }

  return (
    <div className="flex flex-col gap-4">
      {notices.map((notice) => (
        <div
          key={notice.key}
          role="status"
          className="flex items-center justify-between gap-3 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
        >
          <span>
            {notice.title} — {t('admin.queue.alreadyReviewed')}
          </span>
          <button
            type="button"
            onClick={() => dismissNotice(notice.key)}
            aria-label={t('admin.queue.dismiss')}
            className="text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </div>
      ))}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-600">{t('admin.queue.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <PendingItemCard
              key={item.id}
              item={item}
              busy={busyIds.has(item.id)}
              errorCode={itemErrors[item.id] ?? null}
              onApprove={() => void review(item, 'approve')}
              onReject={(reason) => void review(item, 'reject', reason)}
            />
          ))}
        </ul>
      )}

      {cursor && (
        <div className="flex flex-col items-center gap-2 py-2">
          {loadMoreError && (
            <p className="text-sm text-red-700" role="alert">
              {t(apiErrorMessageKey(loadMoreError) as Parameters<typeof t>[0])}
            </p>
          )}
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            aria-busy={loadingMore}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loadingMore ? t('feed.loadingMore') : t('feed.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
