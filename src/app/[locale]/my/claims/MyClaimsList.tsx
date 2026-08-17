'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
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
 * What a withdrawn claim looks like, applied locally rather than refetched.
 *
 * The phone is DROPPED, not kept and hidden: `withdrawClaim` moves the claim
 * out of `approved`, and the server would stop sending the key at all from
 * the next request onward (API.md Rule 1). Rebuilding `giver` from its
 * display name alone is what makes that true in this tab too — the number
 * has to leave the page the moment the claim stops being approved, not on
 * the next reload.
 *
 * An approved claim also releases its item: `withdrawClaim` puts a
 * `reserved` item straight back to `active` in the same transaction, guarded
 * on the reservation being this claimant's. Mirroring that here keeps the
 * item link honest — the row stays openable, because the item is public
 * again.
 */
function asWithdrawn(claim: MyClaim): MyClaim {
  const releasesItem = claim.status === 'approved' && claim.item.status === 'reserved';

  return {
    ...claim,
    status: 'withdrawn',
    item: releasesItem ? { ...claim.item, status: 'active' } : claim.item,
    giver: { displayName: claim.giver.displayName },
  };
}

/**
 * The claimant's list, client-side: one list, newest first, every status
 * mixed together, extended a page at a time from `GET /api/claims/mine`.
 *
 * A single flat list on purpose — this is a history, not a work queue. A
 * withdrawn claim keeps its place in it with its new status rather than
 * vanishing, so "what did I ask for and what came of it" stays answerable
 * by reading top to bottom.
 *
 * Pagination is the feed's, in miniature: a cursor, one page of 20 at a
 * time, and a plain button rather than the feed's `IntersectionObserver`.
 * This list is short (a person's own claims, not a public feed) and always
 * reachable by keyboard, so there is nothing a scroll sentinel buys here.
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

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, ApiErrorCode>>>({});
  const [refreshedNotice, setRefreshedNotice] = useState(false);

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

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * INVALID_STATUS_TRANSITION means the state moved under us — the giver
   * rejected the claim, the sweep released a lapsed reservation (which also
   * flips the claim to `no_show`), or another tab already withdrew it. Not
   * an error to show: the answer is the current state, so this replaces the
   * list with the server's, exactly as `ClaimsBoard` does.
   *
   * The refetch is page 1 with no cursor, so a list the claimant had paged
   * further into collapses back to the newest 20 with the "Load more" button
   * restored. Better than merging a fresh first page into stale later ones
   * whose contents may have shifted rows across the page boundary in the
   * meantime — the notice says the list changed, and it has.
   */
  const refreshFromServer = useCallback(async () => {
    try {
      const response = await api.claims.mine();
      setClaims(response.claims);
      setCursor(response.nextCursor);
      setRefreshedNotice(true);
    } catch {
      // The list on screen is still whatever it was; nothing better to show.
    }
  }, []);

  const handleWithdraw = useCallback(
    async (claim: MyClaim) => {
      setRowErrors((previous) => {
        if (!(claim.id in previous)) return previous;
        const next = { ...previous };
        delete next[claim.id];
        return next;
      });
      setBusy(claim.id, true);
      try {
        await api.claims.withdraw(claim.id);
        setClaims((previous) => previous.map((c) => (c.id === claim.id ? asWithdrawn(c) : c)));
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
        if (code === 'INVALID_STATUS_TRANSITION') {
          await refreshFromServer();
        } else {
          setRowErrors((previous) => ({ ...previous, [claim.id]: code }));
        }
      } finally {
        setBusy(claim.id, false);
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
          <span>{t('myClaims.refreshed')}</span>
          <button
            type="button"
            onClick={() => setRefreshedNotice(false)}
            aria-label={t('myClaims.dismiss')}
            className="cursor-pointer text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </Notice>
      )}

      <ul className="flex flex-col gap-3">
        {claims.map((claim) => (
          <MyClaimRow
            key={claim.id}
            claim={claim}
            now={now}
            busy={busyIds.has(claim.id)}
            errorCode={rowErrors[claim.id] ?? null}
            onWithdraw={() => void handleWithdraw(claim)}
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
              ? t('myClaims.loadingMore')
              : status === 'error'
                ? t('error.retry')
                : t('myClaims.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
