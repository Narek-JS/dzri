'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';

import type { ApiErrorCode } from '@/lib/http';
import type { PendingItem } from '@/lib/api/client';

type Props = {
  /** Already rendered by the server (`page.tsx`) — never refetched here. */
  initialItems: PendingItem[];
  initialNextCursor: string | null;
};

/**
 * The moderation work queue, client-side: pagination and (in a later pass)
 * per-item approve/reject. `page.tsx` fetches the first page server-side —
 * this component only extends it, the same split `FeedList` uses for the
 * public feed.
 */
export function ModerationQueue({ initialItems, initialNextCursor }: Props) {
  const t = useTranslations();

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;

    setLoading(true);
    setErrorCode(null);
    try {
      const response = await api.admin.pendingItems({ cursor });
      setItems((previous) => [...previous, ...response.items]);
      setCursor(response.nextCursor);
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : 'INTERNAL');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-600">{t('admin.queue.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-neutral-300 p-4">
              <p className="font-medium text-neutral-900">{item.title}</p>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div className="flex flex-col items-center gap-2 py-2">
          {errorCode && (
            <p className="text-sm text-red-700" role="alert">
              {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
            </p>
          )}
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-busy={loading}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? t('feed.loadingMore') : t('feed.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
