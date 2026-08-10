'use client';

import { useTranslations } from 'next-intl';

import type { ClaimForOwner } from '@/lib/api/client';

/**
 * The terminal state: the handover happened and the item is `given`. No
 * phone here — the API's status-guarded `case` only ever carries a phone on
 * a claim whose status is `approved`, not `completed` (DECISIONS.md,
 * 2026-08-07), and there is nothing left to act on.
 */
export function GivenView({ claim }: { claim: ClaimForOwner }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-300 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-900">{t('itemClaims.given.title')}</p>
      <p className="text-sm text-neutral-700">
        {t('itemClaims.given.description', { name: claim.claimant.displayName })}
      </p>
    </div>
  );
}
