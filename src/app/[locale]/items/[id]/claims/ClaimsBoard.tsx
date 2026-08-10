'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ApiClientError, api } from '@/lib/api/client';

import { PendingClaimRow } from './PendingClaimRow';

import type { ClaimForOwner } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Props = {
  itemId: string;
  /** Already rendered by the server (`page.tsx`) — never refetched on mount. */
  initialClaims: ClaimForOwner[];
  initialNow: string;
};

/**
 * The giver's decision list, client-side: the pending list plus approve and
 * reject (PART 2). The approved and given states — the handover view, the
 * history of everyone else who asked — come in a later pass; for now an
 * approved claim just stops rendering as a pending row.
 *
 * `now` is lazy-initialized once from the server-sent `initialNow` and never
 * updated — the SSR pass and the hydration pass both start from the same
 * serialized value, matching the pattern `FeedList` and `ModerationQueue`
 * already use, for the same reason (src/lib/relativeTime.ts).
 */
export function ClaimsBoard({ initialClaims, initialNow }: Props) {
  const t = useTranslations();

  const [now] = useState(() => new Date(initialNow));
  const [claims, setClaims] = useState(initialClaims);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, ApiErrorCode>>>({});

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

  function handleApprove(claim: ClaimForOwner) {
    clearRowError(claim.id);
    setBusy(claim.id, true);
    api.claims
      .approve(claim.id)
      .then((response) => {
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
      })
      .catch((error: unknown) => {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
        setRowErrors((previous) => ({ ...previous, [claim.id]: code }));
      })
      .finally(() => setBusy(claim.id, false));
  }

  function handleReject(claim: ClaimForOwner) {
    clearRowError(claim.id);
    setBusy(claim.id, true);
    api.claims
      .reject(claim.id)
      .then(() => {
        setClaims((previous) =>
          previous.map((c) => (c.id === claim.id ? { ...c, status: 'rejected' } : c)),
        );
      })
      .catch((error: unknown) => {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
        setRowErrors((previous) => ({ ...previous, [claim.id]: code }));
      })
      .finally(() => setBusy(claim.id, false));
  }

  const pendingClaims = claims.filter((claim) => claim.status === 'pending');

  if (pendingClaims.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-600">{t('itemClaims.empty')}</p>;
  }

  return (
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
  );
}
