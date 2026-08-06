import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { claims, items, users } from '@/db/schema';
import type { ClaimStatus } from '@/db/schema';

/**
 * The claim lifecycle, and every item-status change that hangs off it. Route
 * handlers never touch `claims.status` or `items.status` directly (CLAUDE.md)
 * — they call these, which are the single place that knows the legal moves.
 *
 * Two things shape how these are written.
 *
 * The neon-http driver has no interactive transaction, so a multi-statement
 * write is a `db.batch`: one atomic transaction over one round trip, but no
 * way to branch on a statement's result mid-flight. Every guard therefore has
 * to be expressed as a WHERE clause. A statement whose precondition fails
 * simply touches zero rows, and the caller reads the row counts afterwards.
 *
 * Because a batch is one transaction, a later statement sees the earlier
 * statements' writes. That is what chains them: the item is reserved first,
 * and the claim's own update then requires that reservation to exist. Either
 * both land or neither does, so a double-click can never approve a claim
 * against an item somebody else already has, and can never leave an approved
 * claim on an unreserved item.
 */

/** The window to actually collect. The sweep releases the item after this. */
export const RESERVATION_HOURS = 48;

export type ClaimActionErrorCode = 'CLAIM_NOT_FOUND' | 'INVALID_STATUS_TRANSITION';

export type ClaimActionResult = { ok: true } | { ok: false; code: ClaimActionErrorCode };

export type ApproveClaimResult =
  | { ok: true; reservedUntil: Date; giverPhone: string; claimantPhone: string }
  | { ok: false; code: ClaimActionErrorCode };

/**
 * What a transition needs to know before it decides anything. Deliberately
 * carries no phone number: every transition reaches for this, so a phone
 * field here would eventually reach a response.
 */
type ClaimContext = {
  status: ClaimStatus;
  claimantId: string;
  itemId: string;
  ownerId: string;
};

async function loadClaim(claimId: string): Promise<ClaimContext | null> {
  const [row] = await db
    .select({
      status: claims.status,
      claimantId: claims.userId,
      itemId: items.id,
      ownerId: items.userId,
    })
    .from(claims)
    .innerJoin(items, eq(claims.itemId, items.id))
    .where(eq(claims.id, claimId))
    .limit(1);

  return row ?? null;
}

/**
 * The only query in the codebase that selects `users.phone` into something a
 * response will carry, and it backs exactly one moment: an approval, returned
 * to the two people it is about. Both ids come from the claim and its item,
 * never from the request, and the result is discarded unless the approval
 * actually commits.
 *
 * Returns null if either account has gone — an account deletion cascades the
 * claim away, so a claim can genuinely evaporate between the load and here.
 */
async function readPhonePair(
  giverId: string,
  claimantId: string,
): Promise<{ giver: string; claimant: string } | null> {
  const rows = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(inArray(users.id, [giverId, claimantId]));

  const giver = rows.find((row) => row.id === giverId)?.phone;
  const claimant = rows.find((row) => row.id === claimantId)?.phone;

  if (!giver || !claimant) return null;

  return { giver, claimant };
}

/**
 * `pending → approved`, and with it the item to `reserved`, plus every other
 * pending claim on that item to `rejected`. This is the moment the two phone
 * numbers become visible to each other, and the only one.
 *
 * The three statements chain on each other's writes:
 *
 *  1. the item moves `active → reserved` only while this claim is pending;
 *  2. the claim moves `pending → approved` only if the item is now reserved
 *     for this claimant — i.e. only if (1) landed;
 *  3. the losing claims are rejected only if this claim is now approved —
 *     i.e. only if (2) landed.
 *
 * So a second click finds the item no longer `active`, (1) and (2) both touch
 * zero rows, nobody gets rejected a second time, and the caller gets
 * INVALID_STATUS_TRANSITION.
 */
export async function approveClaim(claimId: string, actorId: string): Promise<ApproveClaimResult> {
  const claim = await loadClaim(claimId);

  // A missing claim and somebody else's claim are the same 404. That a claim
  // id is real is itself information about a stranger's item.
  if (!claim || claim.ownerId !== actorId) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }
  if (claim.status !== 'pending') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const phones = await readPhonePair(claim.ownerId, claim.claimantId);
  if (!phones) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }

  // Computed here, not as `now() + interval` in SQL, because a batch cannot
  // feed one statement's result into the next and the deadline has to come
  // back in the response — the same reason `createItem` generates its id in
  // application code.
  const reservedUntil = new Date(Date.now() + RESERVATION_HOURS * 60 * 60 * 1000);

  const [, approved] = await db.batch([
    db
      .update(items)
      .set({
        status: 'reserved',
        reservedFor: claim.claimantId,
        reservedUntil,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(items.id, claim.itemId),
          eq(items.status, 'active'),
          sql`exists (select 1 from ${claims} c where c.id = ${claimId} and c.status = 'pending')`,
        ),
      ),

    db
      .update(claims)
      .set({ status: 'approved', respondedAt: sql`now()` })
      .where(
        and(
          eq(claims.id, claimId),
          eq(claims.status, 'pending'),
          sql`exists (select 1 from ${items} i where i.id = ${claim.itemId} and i.status = 'reserved' and i.reserved_for = ${claim.claimantId})`,
        ),
      )
      .returning({ id: claims.id }),

    db
      .update(claims)
      .set({ status: 'rejected', respondedAt: sql`now()` })
      .where(
        and(
          eq(claims.itemId, claim.itemId),
          eq(claims.status, 'pending'),
          ne(claims.id, claimId),
          sql`exists (select 1 from ${claims} c where c.id = ${claimId} and c.status = 'approved')`,
        ),
      ),
  ]);

  // Zero rows means the item was no longer active when the batch ran — a
  // double-click, or another claim approved a moment earlier.
  if (approved.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return {
    ok: true,
    reservedUntil,
    giverPhone: phones.giver,
    claimantPhone: phones.claimant,
  };
}

/**
 * `pending → rejected`. The item is untouched: rejecting one hopeful does not
 * change the listing, which stays active for everybody else.
 *
 * No reason is recorded. Turning somebody down for a free chair is not a
 * moderation action and does not need justification.
 */
export async function rejectClaim(claimId: string, actorId: string): Promise<ClaimActionResult> {
  const claim = await loadClaim(claimId);

  if (!claim || claim.ownerId !== actorId) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }
  if (claim.status !== 'pending') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const updated = await db
    .update(claims)
    .set({ status: 'rejected', respondedAt: sql`now()` })
    .where(and(eq(claims.id, claimId), eq(claims.status, 'pending')))
    .returning({ id: claims.id });

  if (updated.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}

/**
 * `pending | approved → withdrawn`, by the CLAIMANT — the giver has reject
 * and no-show instead.
 *
 * Withdrawing an approved claim releases the item back to `active`. Somebody
 * who backs out must not leave the listing stuck in `reserved` until the
 * sweep notices 48 hours later.
 *
 * The release is guarded on the reservation actually being this claimant's,
 * so withdrawing a merely pending claim touches no item, and a reservation
 * the sweep has already released is not resurrected.
 */
export async function withdrawClaim(claimId: string, actorId: string): Promise<ClaimActionResult> {
  const claim = await loadClaim(claimId);

  if (!claim || claim.claimantId !== actorId) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }
  if (claim.status !== 'pending' && claim.status !== 'approved') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const [withdrawn] = await db.batch([
    db
      .update(claims)
      .set({ status: 'withdrawn', respondedAt: sql`now()` })
      .where(and(eq(claims.id, claimId), inArray(claims.status, ['pending', 'approved'])))
      .returning({ id: claims.id }),

    db
      .update(items)
      .set({ status: 'active', reservedFor: null, reservedUntil: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(items.id, claim.itemId),
          eq(items.status, 'reserved'),
          eq(items.reservedFor, claim.claimantId),
          sql`exists (select 1 from ${claims} c where c.id = ${claimId} and c.status = 'withdrawn')`,
        ),
      ),
  ]);

  if (withdrawn.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}

/**
 * `approved → completed`, and the item to `given`. The handover happened.
 *
 * The item is not required to still be `reserved`: the sweep releases a
 * reservation at `reserved_until` without touching the claim, so a giver
 * confirming a late collection would otherwise find the transition refused.
 * It must not, however, be reserved for somebody *else* by then — that
 * reservation is not this claim's to give away.
 */
export async function completeClaim(claimId: string, actorId: string): Promise<ClaimActionResult> {
  const claim = await loadClaim(claimId);

  if (!claim || claim.ownerId !== actorId) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }
  if (claim.status !== 'approved') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const [completed] = await db.batch([
    db
      .update(claims)
      .set({ status: 'completed', respondedAt: sql`now()` })
      .where(and(eq(claims.id, claimId), eq(claims.status, 'approved')))
      .returning({ id: claims.id }),

    db
      .update(items)
      .set({ status: 'given', givenAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(items.id, claim.itemId),
          or(ne(items.status, 'reserved'), eq(items.reservedFor, claim.claimantId)),
          sql`exists (select 1 from ${claims} c where c.id = ${claimId} and c.status = 'completed')`,
        ),
      ),
  ]);

  if (completed.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}

/**
 * `approved → no_show`, releasing the item back to `active`.
 *
 * This is what feeds `user_reliability`. No-shows are the number one thing
 * that kills a free-item platform, so recording one is a single tap for the
 * giver — and the listing goes straight back up rather than sitting reserved
 * for somebody who never arrived.
 */
export async function markNoShow(claimId: string, actorId: string): Promise<ClaimActionResult> {
  const claim = await loadClaim(claimId);

  if (!claim || claim.ownerId !== actorId) {
    return { ok: false, code: 'CLAIM_NOT_FOUND' };
  }
  if (claim.status !== 'approved') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const [recorded] = await db.batch([
    db
      .update(claims)
      .set({ status: 'no_show', respondedAt: sql`now()` })
      .where(and(eq(claims.id, claimId), eq(claims.status, 'approved')))
      .returning({ id: claims.id }),

    db
      .update(items)
      .set({ status: 'active', reservedFor: null, reservedUntil: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(items.id, claim.itemId),
          eq(items.status, 'reserved'),
          eq(items.reservedFor, claim.claimantId),
          sql`exists (select 1 from ${claims} c where c.id = ${claimId} and c.status = 'no_show')`,
        ),
      ),
  ]);

  if (recorded.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}
