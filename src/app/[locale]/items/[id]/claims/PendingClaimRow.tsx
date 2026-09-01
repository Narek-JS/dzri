'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { apiErrorMessageKey } from '@/lib/api/client';
import { relativeTimeMessage } from '@/lib/relativeTime';

import type { ClaimForOwner } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Props = {
  claim: ClaimForOwner;
  /** Frozen once by `ClaimsBoard` — see that component's doc comment. */
  now: Date;
  busy: boolean;
  errorCode: ApiErrorCode | null;
  onApprove: () => void;
  onReject: () => void;
};

/**
 * One pending claim: the claimant's name, their message, when they asked,
 * and their reliability — completed handovers and no-shows, both plainly
 * stated rather than color-coded, so a no-show record reads as a fact for
 * the giver to weigh, not a punishment (PART 2).
 *
 * Reject is one tap (API.md: turning someone down for a free chair needs no
 * reason). Approve opens an inline confirmation instead, because it is the
 * one consequential, irreversible action on this screen — it reveals both
 * phone numbers and auto-rejects every other pending claim in the same
 * transaction. A giver who taps the wrong row by mistake should get one more
 * chance to notice before that happens.
 *
 * `claimant.displayName` is never the deleted-account sentinel here:
 * `deleteUser` (src/lib/users/delete.ts) withdraws every `pending` claim the
 * deleting user holds in the same call that wipes their name, so a `pending`
 * row can never belong to an already-deleted claimant (DECISIONS.md,
 * 2026-08-30) — unlike `HistoryRow`/`GivenView`, which render terminal
 * statuses a deletion doesn't touch.
 */
export function PendingClaimRow({ claim, now, busy, errorCode, onApprove, onReject }: Props) {
  const t = useTranslations();
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  const askedAgo = relativeTimeMessage(new Date(claim.createdAt), now);

  return (
    <li className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-neutral-900">{claim.claimant.displayName}</span>
        <span className="text-xs text-neutral-500">
          {t('itemClaims.askedAgo', {
            time: t(askedAgo.key as Parameters<typeof t>[0], askedAgo.values),
          })}
        </span>
      </div>

      {claim.message && (
        <p className="text-sm whitespace-pre-wrap text-neutral-800">{claim.message}</p>
      )}

      <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-neutral-600">
        <span>
          {t('itemClaims.reliability.completed', { count: claim.claimant.reliability.completed })}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {t('itemClaims.reliability.noShows', { count: claim.claimant.reliability.noShows })}
        </span>
      </div>

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      {confirmingApprove ? (
        <Notice tone="brand" size="sm" className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-900">
            {t('itemClaims.approve.confirmTitle', { name: claim.claimant.displayName })}
          </p>
          <p className="text-sm text-neutral-700">{t('itemClaims.approve.confirmDescription')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingApprove(false)}
              disabled={busy}
            >
              {t('itemClaims.approve.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={onApprove} disabled={busy} aria-busy={busy}>
              {t('itemClaims.approve.submit')}
            </Button>
          </div>
        </Notice>
      ) : (
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirmingApprove(true)} disabled={busy}>
            {t('itemClaims.approve.open')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onReject}
            disabled={busy}
            aria-busy={busy}
          >
            {t('itemClaims.reject')}
          </Button>
        </div>
      )}
    </li>
  );
}
