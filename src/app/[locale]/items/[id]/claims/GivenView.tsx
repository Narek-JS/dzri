'use client';

import { useTranslations } from 'next-intl';

import { Notice } from '@/components/ui/Notice';
import { resolveDisplayName } from '@/lib/displayName';

import type { ClaimForOwner } from '@/lib/api/client';

/**
 * The terminal state: the handover happened and the item is `given`. No
 * phone here — the API's status-guarded `case` only ever carries a phone on
 * a claim whose status is `approved`, not `completed` (DECISIONS.md,
 * 2026-08-07), and there is nothing left to act on.
 *
 * Unlike the other rows here, this one can genuinely outlive the claimant's
 * account: `given` is terminal and this view keeps rendering for it
 * indefinitely, so `resolveDisplayName` is doing real work here, not just
 * defensive consistency (DECISIONS.md, 2026-08-30).
 */
export function GivenView({ claim }: { claim: ClaimForOwner }) {
  const t = useTranslations();

  return (
    <Notice tone="neutral" className="flex flex-col gap-1">
      <p className="text-sm font-medium text-neutral-900">{t('itemClaims.given.title')}</p>
      <p className="text-sm text-neutral-700">
        {t('itemClaims.given.description', {
          name: resolveDisplayName(claim.claimant.displayName, t),
        })}
      </p>
    </Notice>
  );
}
