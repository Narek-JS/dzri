import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { claims, items } from '@/db/schema';
import type { ItemStatus } from '@/db/schema';

/**
 * The giver taking their own listing down. Route handlers never mutate
 * `items.status` directly (CLAUDE.md) — this is the single place that knows
 * which statuses a removal is legal from and what it drags with it.
 */

/**
 * A removal is allowed only out of a status where nobody is waiting on the
 * item.
 *
 * `reserved`, `given` and `expired` are deliberately absent. A reserved item
 * has a live approved claim behind it: somebody was picked, everyone else was
 * turned away, and they are on their way across town. It must not vanish from
 * under them — the giver marks it `no_show` or completes it, or waits for the
 * sweep to release the reservation, and only then can they remove it. `given`
 * and `expired` are terminal and there is nothing left to take down.
 *
 * `removed` is absent too, so a second delete is refused rather than silently
 * succeeding. That is the same shape as the moderation helpers: a repeated
 * action on a row that has already moved is INVALID_STATUS_TRANSITION.
 */
export const REMOVABLE_STATUSES = [
  'draft',
  'pending_review',
  'active',
  'rejected',
] as const satisfies readonly ItemStatus[];

export type RemoveItemErrorCode = 'ITEM_NOT_FOUND' | 'INVALID_STATUS_TRANSITION';

export type RemoveItemResult = { ok: true } | { ok: false; code: RemoveItemErrorCode };

/**
 * `draft | pending_review | active | rejected → removed`, plus every pending
 * claim on the item to `rejected`.
 *
 * This is a SOFT delete. The row stays, the `item_images` rows stay, and the
 * R2 objects stay. `removed` is a terminal status that hides the item
 * everywhere, and keeping the row means the claims that pointed at it still
 * resolve — a claimant looking at their own history sees what they asked for,
 * not a dangling id. Reclaiming the storage is the orphan-cleanup problem
 * (DECISIONS.md), not this function's.
 *
 * Ownership is checked before the status, so a stranger gets ITEM_NOT_FOUND
 * for an item they could not have removed anyway, and never a 409 that would
 * confirm the id names something real and tell them what state it is in.
 *
 * Two tables, so one `db.batch`: neon-http has no interactive transaction, but
 * a batch is a single atomic transaction, so either both statements land or
 * neither does (DECISIONS.md). The claim update runs *first* and carries the
 * item's precondition in an `exists`, because the item update erases the very
 * status it matches on — running it second would mean it could never tell
 * whether the removal it is cascading from was legal. Both statements evaluate
 * the same predicate against the same rows in the same transaction, so they
 * cannot disagree.
 *
 * `rejection_reason` is cleared on the way out. The check constraint
 * `rejection_reason_matches_status` forbids a non-rejected item from carrying
 * one, so removing an admin-rejected item without clearing it would fail the
 * write.
 */
export async function removeItem(itemId: string, actorId: string): Promise<RemoveItemResult> {
  const [item] = await db
    .select({ userId: items.userId, status: items.status })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);

  // A missing item and somebody else's item are the same 404 — never a 403.
  if (!item || item.userId !== actorId) {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }

  const removable: readonly ItemStatus[] = REMOVABLE_STATUSES;
  if (!removable.includes(item.status)) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const [, removed] = await db.batch([
    // Everyone still waiting on this listing is turned down, because the thing
    // they asked for is gone. Guarded on the item still being the caller's and
    // still removable, so a race that took it elsewhere cannot reject a
    // stranger's claimants as a side effect.
    //
    // `item_removed` is stamped in the same `set` as the status, in the same
    // statement, in the same transaction as the removal it cascades from —
    // these people were not turned down and lost to nobody, and the my-claims
    // screen reads this column to say so. `claim_rejected_reason_matches_status`
    // rejects the write outright if this is ever dropped.
    db
      .update(claims)
      .set({ status: 'rejected', rejectedReason: 'item_removed', respondedAt: sql`now()` })
      .where(
        and(
          eq(claims.itemId, itemId),
          eq(claims.status, 'pending'),
          sql`exists (
            select 1
            from ${items} i
            where i.id = ${itemId}
              and i.user_id = ${actorId}
              and i.status in ('draft', 'pending_review', 'active', 'rejected')
          )`,
        ),
      ),

    db
      .update(items)
      .set({ status: 'removed', rejectionReason: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(items.id, itemId),
          eq(items.userId, actorId),
          inArray(items.status, REMOVABLE_STATUSES),
        ),
      )
      .returning({ id: items.id }),
  ]);

  // Zero rows means the status moved between the load and the batch — a
  // double-tap, or a claim approved a moment earlier.
  if (removed.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}
