'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';

import { MyClaimRow } from './MyClaimRow';

import type { MyClaim } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Status = 'idle' | 'loading' | 'error';

type Props = {
  /** Already rendered by the server (`page.tsx`) — never refetched on mount. */
  initialClaims: MyClaim[];
  initialNextCursor: string | null;
  /**
   * ISO timestamp, computed once by `page.tsx` at request time. Every row's
   * "asked N days ago" — this first page and every page `loadMore` appends —
   * is measured against this same instant. See relativeTime.ts for why a row
   * can't ask `Intl.RelativeTimeFormat`/`useFormatter` for this, and `now`
   * below for why it can't call `new Date()` per render either.
   */
  initialNow: string;
};

/**
 * The claimant's list, client-side: one list, newest first, every status
 * mixed together, extended a page at a time from `GET /api/claims/mine`.
 *
 * A single flat list on purpose — this is a history, not a work queue. A
 * withdrawn or rejected claim keeps its place in it rather than being
 * filtered out or shunted into a separate section, so "what did I ask for
 * and what came of it" is answerable by reading top to bottom.
 *
 * Pagination is the feed's, in miniature: a cursor, one page of 20 at a
 * time, and a plain button rather than the feed's `IntersectionObserver`.
 * This list is short (a person's own claims, not a public feed) and always
 * reachable by keyboard, so there is nothing for a scroll sentinel to buy
 * here.
 */
export function MyClaimsList({ initialClaims, initialNextCursor, initialNow }: Props) {
  const t = useTranslations();

  // Lazy-initialized once from the server-sent `initialNow` and never
  // updated — the SSR pass and the hydration pass start from the same
  // serialized value, so there is no clock drift for a row's bucket to
  // disagree about, on this page or on pages appended later.
  const [now] = useState(() => new Date(initialNow));

  const [claims, setClaims] = useState(initialClaims);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [status, setStatus] = useState<Status>('idle');
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  const loadMore = useCallback(async () => {
    if (cursor === null || status === 'loading') return;

    setStatus('loading');
    setErrorCode(null);
    try {
      const response = await api.claims.mine({ cursor });
      setClaims((previous) => [...previous, ...response.claims]);
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
        {claims.map((claim) => (
          <MyClaimRow key={claim.id} claim={claim} now={now} />
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
              ? t('myClaims.loadingMore')
              : status === 'error'
                ? t('error.retry')
                : t('myClaims.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
