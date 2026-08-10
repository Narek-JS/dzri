'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import type { ClaimForOwner } from '@/lib/api/client';

type Props = {
  itemId: string;
  /** Already rendered by the server (`page.tsx`) — never refetched on mount. */
  initialClaims: ClaimForOwner[];
  initialNow: string;
};

/**
 * The giver's decision list, client-side. Pagination and per-claim
 * actions (approve/reject/complete/no-show, and the states they lead to)
 * come in a later pass — this is the page scaffold: the list itself,
 * oldest first, already rendered by the server.
 */
export function ClaimsBoard({ initialClaims }: Props) {
  const t = useTranslations();

  const [claims] = useState(initialClaims);

  if (claims.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-600">{t('itemClaims.empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {claims.map((claim) => (
        <li key={claim.id} className="rounded border border-neutral-300 p-4">
          <p className="font-medium text-neutral-900">{claim.claimant.displayName}</p>
        </li>
      ))}
    </ul>
  );
}
