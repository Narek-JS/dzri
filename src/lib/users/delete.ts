import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { claims, deviceTokens, items, users } from '@/db/schema';

import { withdrawClaim } from '@/lib/claims/transitions';
import { DELETED_USER_DISPLAY_NAME } from '@/lib/displayName';
import { REMOVABLE_STATUSES, removeItem } from '@/lib/items/remove';

/**
 * Account deletion. A SOFT delete, for the same reason item deletion is one
 * (DECISIONS.md, 2026-08-08): the row stays, because `claims.userId`
 * cascades, and a hard delete would silently erase every claim this person
 * ever made — including completed ones another giver's history still
 * points at — and would quietly revise `user_reliability` for everyone
 * they ever transacted with. See DECISIONS.md, 2026-08-30, for the full
 * reasoning.
 *
 * Every step here goes through the same transition helpers a route handler
 * would use — `removeItem`, `withdrawClaim` — never a direct `UPDATE` on
 * `items.status` or `claims.status` (CLAUDE.md). This is not one
 * transaction end to end: each helper is already its own atomic,
 * guarded-by-WHERE-clause step, so a run interrupted partway (a serverless
 * timeout, most plausibly) leaves a state that is safe to resume — some
 * items already `removed`, the rest still exactly as they were, the user
 * not yet marked deleted — rather than a half-applied write with no way to
 * tell what happened. Calling this again from the top finishes the job:
 * every step is a no-op on rows it already touched.
 */

export type DeleteUserErrorCode = 'ACCOUNT_HAS_RESERVED_ITEMS';
export type DeleteUserResult = { ok: true } | { ok: false; code: DeleteUserErrorCode };

/**
 * `draft | pending_review | active | rejected → removed` for every item this
 * user gave away, `pending | approved → withdrawn` for every claim they hold
 * as a claimant, their device tokens gone outright, and finally the identity
 * fields wiped.
 *
 * Refuses outright if the user has a `reserved` item of their own. That
 * mirrors `removeItem`'s own refusal on a single listing (DECISIONS.md,
 * 2026-08-08): somebody was picked, everyone else was turned away, and they
 * may be on their way across town. Silently no-showing that claim as a side
 * effect of an unrelated "delete my account" action would be a worse
 * surprise to the counterparty than telling the giver to resolve it first —
 * complete it, mark a no-show, or wait for the sweep to release it — and
 * only then delete. This check only looks at items the user *gives*; an
 * `approved` claim they *hold* on somebody else's item is handled by the
 * withdrawal loop below instead, which releases that item back to `active`
 * immediately rather than leaving it reserved for a account that can never
 * complete the handover.
 *
 * `deviceTokens` are hard-deleted, not soft — the one deliberate exception
 * here. A token is a device credential, not somebody's transaction history:
 * nothing points at it the way a claim points at an item, and a lingering
 * row is a live push channel aimed at an account that no longer exists.
 * `sendPushToUser` (src/lib/push/index.ts) has no reason to know better.
 *
 * `displayName` is set to the empty string, not a stored placeholder —
 * `resolveDisplayName` (src/lib/displayName.ts) is what turns that into
 * translated copy, at render time, in whichever locale is asking.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const [reservedItem] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.status, 'reserved')))
    .limit(1);

  if (reservedItem) {
    return { ok: false, code: 'ACCOUNT_HAS_RESERVED_ITEMS' };
  }

  const removableItems = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.status, REMOVABLE_STATUSES)));

  for (const item of removableItems) {
    await removeItem(item.id, userId);
  }

  const ownClaims = await db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.userId, userId), inArray(claims.status, ['pending', 'approved'])));

  for (const claim of ownClaims) {
    await withdrawClaim(claim.id, userId);
  }

  await db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));

  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      phone: null,
      displayName: DELETED_USER_DISPLAY_NAME,
      avatarUrl: null,
    })
    .where(eq(users.id, userId));

  return { ok: true };
}
