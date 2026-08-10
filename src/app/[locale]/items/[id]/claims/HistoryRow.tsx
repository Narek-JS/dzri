'use client';

import { useTranslations } from 'next-intl';

import { relativeTimeMessage } from '@/lib/relativeTime';

import type { ClaimForOwner } from '@/lib/api/client';
import type { ClaimStatus } from '@/db/schema';

/**
 * `pending` and `approved` never reach this row — `ClaimsBoard` only ever
 * puts the claims here that are not the one currently featured (the
 * approved or completed claim), and approving auto-rejects every other
 * pending claim in the same transaction, so nothing pending is ever left
 * over to render this way.
 */
const STATUS_LABEL_KEYS: Partial<Record<ClaimStatus, string>> = {
  rejected: 'itemClaims.history.status.rejected',
  withdrawn: 'itemClaims.history.status.withdrawn',
  no_show: 'itemClaims.history.status.no_show',
  completed: 'itemClaims.history.status.completed',
};

/**
 * One past claim, shown below the current handover (or given) view so the
 * giver can see who else asked and that they were turned down (PART 3) —
 * greyed out, no actions, no phone (the API only ever carries a phone on a
 * claim whose status is currently `approved`, and none of these are).
 */
export function HistoryRow({ claim, now }: { claim: ClaimForOwner; now: Date }) {
  const t = useTranslations();
  const askedAgo = relativeTimeMessage(new Date(claim.createdAt), now);
  const statusKey = STATUS_LABEL_KEYS[claim.status];

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-500">
      <span className="font-medium">{claim.claimant.displayName}</span>
      <span className="text-xs">
        {statusKey && t(statusKey as Parameters<typeof t>[0])}
        {' · '}
        {t(askedAgo.key as Parameters<typeof t>[0], askedAgo.values)}
      </span>
    </li>
  );
}
