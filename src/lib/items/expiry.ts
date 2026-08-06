import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { claims, items } from '@/db/schema';

/**
 * The two item transitions nobody clicks: the ones time makes on its own.
 *
 * Everything expires (DECISIONS.md). Dead listings are what killed every
 * free-item board before this one — you browse forty items, message five
 * people, get zero replies, never come back. So a listing nobody collected
 * goes away, and a listing held for somebody who never turned up goes back up.
 *
 * These live here rather than inline in the sweep for the same reason the
 * moderation and claim transitions do (CLAUDE.md): `items.status` is only ever
 * moved by a helper that knows which move is legal.
 *
 * Both are written as one set-based conditional UPDATE guarded on the status
 * it expects, not read-then-write. There is no window between the read and the
 * write to lose a race in: Postgres evaluates the guard against the current
 * row version, so an item somebody collected, withdrew from or deleted a
 * millisecond earlier simply does not match. That is what makes the sweep safe
 * to run twice, or twice at once — a second run finds nothing left to do and
 * reports zero.
 */

export type ReleasedReservations = {
  /** Items put back on the feed. */
  reservationsReleased: number;
  /** Claims recorded against the person who was picked and did not come. */
  noShowsRecorded: number;
};

/**
 * `reserved → active` for every reservation past its `reserved_until`, and the
 * claim that held it `approved → no_show`.
 *
 * The no-show is the point. Somebody was picked, the other hopefuls were
 * turned away, the window passed and they never collected — that is exactly
 * what `no_show` means, and it must count in `user_reliability` the same way
 * the giver tapping the button does. It is what the next giver sees before
 * choosing between strangers.
 *
 * Two tables, so one `db.batch`: neon-http has no interactive transaction, but
 * a batch is a single atomic transaction, so either both statements land or
 * neither does (DECISIONS.md).
 *
 * The claim update runs *first*, and the order is load-bearing twice over.
 * It still needs to see the item as `reserved` to find the claim that held it
 * — the item update erases exactly the columns it matches on. And it takes the
 * claim row's lock first, which is the lock every competing transition takes
 * first too: complete, withdraw and manual no-show all update the claim before
 * the item. A giver confirming a handover in the same instant therefore blocks
 * on our claim row, re-reads it as `no_show` after we commit, matches nothing
 * and is refused, rather than half-completing against an item we just
 * released.
 *
 * The item update is deliberately *not* chained on the claim update: a
 * `reserved` row with no approved claim behind it is releasable all the same,
 * and leaving it stuck forever would be the worse failure.
 */
export async function releaseExpiredReservations(): Promise<ReleasedReservations> {
  const [noShows, released] = await db.batch([
    db
      .update(claims)
      .set({ status: 'no_show', respondedAt: sql`now()` })
      .where(
        and(
          eq(claims.status, 'approved'),
          // `reserved_for` pins it to the claim that actually holds the item,
          // so a stray approved claim on the same item is left alone.
          sql`exists (
            select 1
            from ${items} i
            where i.id = ${claims.itemId}
              and i.status = 'reserved'
              and i.reserved_for = ${claims.userId}
              and i.reserved_until < now()
          )`,
        ),
      )
      .returning({ id: claims.id }),

    db
      .update(items)
      .set({ status: 'active', reservedFor: null, reservedUntil: null, updatedAt: sql`now()` })
      .where(and(eq(items.status, 'reserved'), lt(items.reservedUntil, sql`now()`)))
      .returning({ id: items.id }),
  ]);

  return { reservationsReleased: released.length, noShowsRecorded: noShows.length };
}

/**
 * `active → expired` for every listing past its `expires_at`.
 *
 * `expired` is terminal: the giver reposts if they still have the thing. An
 * item that has sat unclaimed for 30 days is either gone or was never really
 * on offer, and either way it is the kind of listing that teaches people the
 * feed is full of ghosts.
 *
 * @returns how many items were expired.
 */
export async function expireOverdueItems(): Promise<number> {
  const expired = await db
    .update(items)
    .set({ status: 'expired', updatedAt: sql`now()` })
    .where(and(eq(items.status, 'active'), lt(items.expiresAt, sql`now()`)))
    .returning({ id: items.id });

  return expired.length;
}
