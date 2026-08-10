import { notFound } from 'next/navigation';

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { requireUser } from '@/lib/auth/session';
import { getClaimsForOwner } from '@/lib/claims/forOwner';
import { getOwnerPhone } from '@/lib/claims/ownerPhone';

import { ClaimsBoard } from './ClaimsBoard';

import type { ItemStatus } from '@/db/schema';

const ITEM_STATUS_KEYS: Record<ItemStatus, string> = {
  draft: 'itemClaims.itemStatus.draft',
  active: 'itemClaims.itemStatus.active',
  reserved: 'itemClaims.itemStatus.reserved',
  given: 'itemClaims.itemStatus.given',
  expired: 'itemClaims.itemStatus.expired',
  removed: 'itemClaims.itemStatus.removed',
  pending_review: 'itemClaims.itemStatus.pending_review',
  rejected: 'itemClaims.itemStatus.rejected',
};

/**
 * The giver's decision list for one item.
 *
 * Server component. OWNER ONLY — `requireUser()` returns null for anonymous
 * *and* for a banned user, and `getClaimsForOwner` returns null for a
 * missing item, somebody else's item, or a malformed id. Every one of those
 * renders the same `notFound()` (CLAUDE.md Rule 2): a signed-in stranger, or
 * someone who claimed the item themselves, learns nothing by probing this
 * URL — never a "you don't have permission" page.
 *
 * `getClaimsForOwner` (src/lib/claims/forOwner.ts) is the exact query
 * `GET /api/items/[id]/claims` runs, called directly rather than over HTTP —
 * the same split `getFeed` and `getPendingQueue` already established for the
 * feed and admin pages.
 */
export default async function ItemClaimsPage({
  params,
}: {
  params: Promise<LocaleParams & { id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);

  const user = await requireUser();
  if (!user) {
    notFound();
  }

  const result = await getClaimsForOwner(id, user.id);
  if (!result) {
    notFound();
  }

  const { item, claims } = result;

  // Frozen once, threaded down (serialized) to `ClaimsBoard` — see
  // src/lib/relativeTime.ts and ModerationQueue's `now` state (the admin
  // queue) for why every "ago"/"left" on this page reads against one
  // instant instead of each render's own `new Date()`.
  const now = new Date();

  // Only ever read when there is an approved claim to show it for — see
  // ownerPhone.ts for why this is not a fourth phone-bearing endpoint.
  const hasApprovedClaim = claims.some((claim) => claim.status === 'approved');
  const giverPhone = hasApprovedClaim ? await getOwnerPhone(user.id) : null;

  const t = await getTranslations();

  const serializedClaims = claims.map((claim) => ({
    ...claim,
    createdAt: claim.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="sr-only">{t('pages.itemClaims')}</h1>

      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-neutral-900">{item.title}</h2>
        <p className="text-sm text-neutral-600">
          {t(ITEM_STATUS_KEYS[item.status] as Parameters<typeof t>[0])}
        </p>
      </div>

      <ClaimsBoard
        itemId={item.id}
        initialClaims={serializedClaims}
        initialNow={now.toISOString()}
        initialGiverPhone={giverPhone}
        initialReservedUntil={item.reservedUntil ? item.reservedUntil.toISOString() : null}
      />
    </main>
  );
}
