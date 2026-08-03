import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { items } from '@/db/schema';

/**
 * The moderation status transitions. Route handlers never mutate
 * `items.status` directly (CLAUDE.md) — they go through these helpers,
 * which are the single place that knows an item may only be approved or
 * rejected out of `pending_review`.
 *
 * Both are written as a conditional update guarded on
 * `status = 'pending_review'`, so they are safe against a double-click and
 * against two admins acting at once: the guard is evaluated atomically by
 * Postgres, exactly one update touches the row, and the loser sees zero
 * rows affected. Zero rows means the item was not pending — already
 * reviewed, or never in a reviewable state — and maps onto
 * INVALID_STATUS_TRANSITION. There is no separate "not found" here: a
 * missing id is indistinguishable from a non-pending one, and both are the
 * same refusal to the caller.
 */

export type ModerationResult = { ok: true } | { ok: false; code: 'INVALID_STATUS_TRANSITION' };

/**
 * `pending_review → active`.
 *
 * Resets `expiresAt` to 30 days from *now*, not from submission: the
 * 30-day lifetime starts when the item becomes visible, so a slow review
 * never silently eats into it. Clears any prior `rejectionReason` (the
 * check constraint forbids a non-rejected item carrying one) and records
 * who reviewed it and when.
 */
export async function approveItem(itemId: string, adminId: string): Promise<ModerationResult> {
  const updated = await db
    .update(items)
    .set({
      status: 'active',
      reviewedAt: sql`now()`,
      reviewedBy: adminId,
      rejectionReason: null,
      expiresAt: sql`now() + interval '30 days'`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(items.id, itemId), eq(items.status, 'pending_review')))
    .returning({ id: items.id });

  if (updated.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}

/**
 * `pending_review → rejected`.
 *
 * `reason` is stored verbatim — it is shown to the giver in
 * `/api/items/mine`, so it is user-facing text, not an internal note, and
 * is never truncated here (length is bounded by the route's schema). The
 * check constraint requires a rejected item to carry a reason, which the
 * caller guarantees by validating it before this runs.
 */
export async function rejectItem(
  itemId: string,
  adminId: string,
  reason: string,
): Promise<ModerationResult> {
  const updated = await db
    .update(items)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      reviewedAt: sql`now()`,
      reviewedBy: adminId,
      updatedAt: sql`now()`,
    })
    .where(and(eq(items.id, itemId), eq(items.status, 'pending_review')))
    .returning({ id: items.id });

  if (updated.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}
