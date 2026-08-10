'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api } from '@/lib/api/client';

import { GivenView } from './GivenView';
import { HandoverView } from './HandoverView';
import { HistoryRow } from './HistoryRow';
import { PendingClaimRow } from './PendingClaimRow';

import type { ClaimForOwner } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Props = {
  itemId: string;
  /** Already rendered by the server (`page.tsx`) — never refetched on mount. */
  initialClaims: ClaimForOwner[];
  initialNow: string;
  initialGiverPhone: string | null;
  initialReservedUntil: string | null;
};

/**
 * The giver's decision list, client-side: the pending list, the approved
 * handover, or the given summary, switched on the claims themselves — plus
 * every action PART 2/3 need (approve, reject, complete, no-show) and the
 * 409 recovery PART 3 asks for.
 *
 * At most one claim is ever `approved` at a time, and at most one is ever
 * `completed` — both are database invariants (`approveClaim` rejects every
 * other pending claim in the same transaction; only one claim can move an
 * item to `given`) — so `claims.find` for either is always unambiguous.
 * Every non-pending claim that isn't that featured one is history (PART 3:
 * "the auto-rejected claims stay visible below") — shown whether or not
 * there currently *is* a featured claim, so a no-show (which un-features
 * the claim it happened to, leaving nothing pending or approved) doesn't
 * wipe the only record on this page of who asked and what happened.
 *
 * `now` is lazy-initialized once from the server-sent `initialNow` and never
 * updated — the SSR pass and the hydration pass both start from the same
 * serialized value, matching the pattern `FeedList` and `ModerationQueue`
 * already use, for the same reason (src/lib/relativeTime.ts).
 *
 * Approve is the one action that mutates more than its own row — it rejects
 * every other pending claim in the same server transaction — so its success
 * handler replicates that same rule locally instead of refetching: exactly
 * the claims that were `pending` move to `rejected`, because that is
 * `approveClaim`'s documented, atomic behavior, not a guess.
 */
export function ClaimsBoard({
  itemId,
  initialClaims,
  initialNow,
  initialGiverPhone,
  initialReservedUntil,
}: Props) {
  const t = useTranslations();

  const [now] = useState(() => new Date(initialNow));
  const [claims, setClaims] = useState(initialClaims);
  const [giverPhone, setGiverPhone] = useState(initialGiverPhone);
  const [reservedUntil, setReservedUntil] = useState(
    initialReservedUntil ? new Date(initialReservedUntil) : null,
  );
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, ApiErrorCode>>>({});
  const [refreshedNotice, setRefreshedNotice] = useState(false);

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearRowError = useCallback((id: string) => {
    setRowErrors((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  /**
   * INVALID_STATUS_TRANSITION means the state moved under us — another tab,
   * a withdrawal, or the sweep releasing a lapsed reservation (which also
   * flips the claim itself to `no_show`, so a plain claims refetch is
   * enough to learn about it; there's no separate item-status field to
   * re-read). Replaces the whole list with the server's current truth and
   * drops `giverPhone`/`reservedUntil` if there is no longer an approved
   * claim to show them for, rather than leaving a stale handover view up.
   */
  const refreshFromServer = useCallback(async () => {
    try {
      const response = await api.claims.listForItem(itemId);
      setClaims(response.claims);
      if (!response.claims.some((claim) => claim.status === 'approved')) {
        setGiverPhone(null);
        setReservedUntil(null);
      }
      setRefreshedNotice(true);
    } catch {
      // The list on screen is still whatever it was; nothing better to show.
    }
  }, [itemId]);

  const performAction = useCallback(
    async <T,>(claim: ClaimForOwner, action: () => Promise<T>, onSuccess: (result: T) => void) => {
      clearRowError(claim.id);
      setBusy(claim.id, true);
      try {
        const result = await action();
        onSuccess(result);
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
        if (code === 'INVALID_STATUS_TRANSITION') {
          void refreshFromServer();
        } else {
          setRowErrors((previous) => ({ ...previous, [claim.id]: code }));
        }
      } finally {
        setBusy(claim.id, false);
      }
    },
    [clearRowError, refreshFromServer, setBusy],
  );

  function handleApprove(claim: ClaimForOwner) {
    void performAction(
      claim,
      () => api.claims.approve(claim.id),
      (response) => {
        setGiverPhone(response.giverPhone);
        setReservedUntil(new Date(response.reservedUntil));
        setClaims((previous) =>
          previous.map((c) => {
            if (c.id === claim.id) {
              return {
                ...c,
                status: 'approved',
                claimant: { ...c.claimant, phone: response.claimantPhone },
              };
            }
            // approveClaim rejects every other still-pending claim, atomically.
            if (c.status === 'pending') {
              return { ...c, status: 'rejected' };
            }
            return c;
          }),
        );
      },
    );
  }

  function handleReject(claim: ClaimForOwner) {
    void performAction(
      claim,
      () => api.claims.reject(claim.id),
      () => {
        setClaims((previous) =>
          previous.map((c) => (c.id === claim.id ? { ...c, status: 'rejected' } : c)),
        );
      },
    );
  }

  function handleComplete(claim: ClaimForOwner) {
    void performAction(
      claim,
      () => api.claims.complete(claim.id),
      () => {
        setClaims((previous) =>
          previous.map((c) => (c.id === claim.id ? { ...c, status: 'completed' } : c)),
        );
      },
    );
  }

  function handleNoShow(claim: ClaimForOwner) {
    void performAction(
      claim,
      () => api.claims.noShow(claim.id),
      () => {
        setClaims((previous) =>
          previous.map((c) => (c.id === claim.id ? { ...c, status: 'no_show' } : c)),
        );
      },
    );
  }

  const approvedClaim = claims.find((claim) => claim.status === 'approved') ?? null;
  const completedClaim = claims.find((claim) => claim.status === 'completed') ?? null;
  const pendingClaims = claims.filter((claim) => claim.status === 'pending');
  const featuredId = approvedClaim?.id ?? completedClaim?.id ?? null;
  // Everything that isn't pending (still actionable, shown above) and isn't
  // the featured claim (already shown as the handover/given view above).
  // Not gated on a featured claim existing: a no-show or a plain rejection
  // with nothing else pending leaves this as the *only* record on screen of
  // who asked and what happened to them, and that must not disappear just
  // because there's nothing left to act on.
  const historyClaims = claims.filter(
    (claim) => claim.status !== 'pending' && claim.id !== featuredId,
  );

  return (
    <div className="flex flex-col gap-4">
      {refreshedNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
        >
          <span>{t('itemClaims.refreshed')}</span>
          <button
            type="button"
            onClick={() => setRefreshedNotice(false)}
            aria-label={t('itemClaims.dismiss')}
            className="text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </div>
      )}

      {approvedClaim && giverPhone && reservedUntil ? (
        <HandoverView
          claim={approvedClaim}
          giverPhone={giverPhone}
          reservedUntil={reservedUntil}
          now={now}
          busy={busyIds.has(approvedClaim.id)}
          errorCode={rowErrors[approvedClaim.id] ?? null}
          onComplete={() => handleComplete(approvedClaim)}
          onNoShow={() => handleNoShow(approvedClaim)}
        />
      ) : completedClaim ? (
        <GivenView claim={completedClaim} />
      ) : pendingClaims.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {pendingClaims.map((claim) => (
            <PendingClaimRow
              key={claim.id}
              claim={claim}
              now={now}
              busy={busyIds.has(claim.id)}
              errorCode={rowErrors[claim.id] ?? null}
              onApprove={() => handleApprove(claim)}
              onReject={() => handleReject(claim)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-neutral-600">{t('itemClaims.empty')}</p>
      )}

      {historyClaims.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-700">{t('itemClaims.history.title')}</h3>
          <ul className="flex flex-col gap-2">
            {historyClaims.map((claim) => (
              <HistoryRow key={claim.id} claim={claim} now={now} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
