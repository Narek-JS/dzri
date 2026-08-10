'use client';

import { useTranslations } from 'next-intl';

import { apiErrorMessageKey } from '@/lib/api/client';
import { countdownMessage } from '@/lib/relativeTime';

import type { ClaimForOwner } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

type Props = {
  claim: ClaimForOwner;
  /**
   * The giver's own number. Never from `GET /api/items/[id]/claims` — see
   * `src/lib/claims/ownerPhone.ts` for why a route handler never returns
   * this and where it comes from instead.
   */
  giverPhone: string;
  reservedUntil: Date;
  now: Date;
  busy: boolean;
  errorCode: ApiErrorCode | null;
  onComplete: () => void;
  onNoShow: () => void;
};

/**
 * The handover view: both phone numbers, prominently, the moment the
 * transaction becomes possible (PART 3). Replaces the pending list entirely
 * — there is at most one `approved` claim on an item at a time, by
 * construction (`approveClaim` rejects every other pending claim in the
 * same transaction).
 *
 * The 48-hour window is shown as a countdown (`countdownMessage`, not a raw
 * timestamp) so the giver reads it as a deadline rather than doing the
 * subtraction themselves.
 *
 * Complete and no-show are both one tap, no confirmation — API.md is
 * explicit about no-show ("a giver who has just wasted an evening will not
 * fill in a form"), and complete gets the same treatment because it is only
 * ever confirming something that already happened in person, not causing a
 * consequence the way approve does.
 */
export function HandoverView({
  claim,
  giverPhone,
  reservedUntil,
  now,
  busy,
  errorCode,
  onComplete,
  onNoShow,
}: Props) {
  const t = useTranslations();
  const countdown = countdownMessage(reservedUntil, now);
  const claimantPhone = claim.claimant.phone;

  return (
    <div className="flex flex-col gap-4 rounded border border-brand-strong bg-brand-tint p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-brand-strong">{t('itemClaims.handover.title')}</p>
        <p className="text-sm text-neutral-700">{t('itemClaims.handover.description')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded border border-neutral-300 bg-white p-3">
          <span className="text-xs text-neutral-600">{t('itemClaims.handover.yourNumber')}</span>
          <a href={`tel:${giverPhone}`} className="text-lg font-semibold text-neutral-900">
            {giverPhone}
          </a>
        </div>
        <div className="flex flex-col gap-1 rounded border border-neutral-300 bg-white p-3">
          <span className="text-xs text-neutral-600">{t('itemClaims.handover.theirNumber')}</span>
          {claimantPhone && (
            <a href={`tel:${claimantPhone}`} className="text-lg font-semibold text-neutral-900">
              {claimantPhone}
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-600">{t('itemClaims.handover.deadline')}</span>
        <span className="text-sm font-medium text-neutral-900">
          {t(countdown.key as Parameters<typeof t>[0], countdown.values)}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-900">{claim.claimant.displayName}</span>
        {claim.message && <p className="whitespace-pre-wrap text-neutral-700">{claim.message}</p>}
      </div>

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          aria-busy={busy}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {t('itemClaims.handover.complete')}
        </button>
        <button
          type="button"
          onClick={onNoShow}
          disabled={busy}
          aria-busy={busy}
          className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          {t('itemClaims.handover.noShow')}
        </button>
      </div>
    </div>
  );
}
