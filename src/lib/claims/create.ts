import { and, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { claims, items } from '@/db/schema';

/** "I can come today after 6" — enough to introduce yourself, not a chat. */
export const MAX_CLAIM_MESSAGE_LENGTH = 300;

export type CreateClaimInput = {
  itemId: string;
  userId: string;
  message: string | null;
};

/** Each maps 1:1 onto an `ApiErrorCode`, so the route needs no translation. */
export type CreateClaimErrorCode = 'ITEM_NOT_FOUND' | 'CANNOT_CLAIM_OWN_ITEM' | 'ALREADY_CLAIMED';

export type CreateClaimResult =
  | { ok: true; id: string; itemOwnerId: string; itemTitleHy: string | null }
  | { ok: false; code: CreateClaimErrorCode };

/**
 * Postgres unique-violation SQLSTATE. Drizzle wraps the driver error in a
 * `DrizzleQueryError` and hangs the original off `cause`, so the code has to
 * be looked for down the chain rather than on the thrown error itself.
 */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  let current = error;

  // Bounded: a cycle in `cause` would otherwise spin forever.
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    if ('code' in current && current.code === UNIQUE_VIOLATION) return true;
    if (!('cause' in current)) return false;

    current = current.cause;
  }

  return false;
}

/**
 * Records one person's interest in one item.
 *
 * The item must be `active` and unexpired. Every other status — reserved,
 * given, pending_review, rejected, expired, removed — is ITEM_NOT_FOUND, the
 * same 404 a stranger gets from the detail route. Never a 403: that would
 * confirm the id names something real.
 *
 * Duplicates are resolved by `claims_item_id_user_id_unique`, not by a prior
 * read. Two taps on the same button race, and a check-then-insert would let
 * both through the check; the constraint is the thing that actually holds, so
 * the violation is caught and reported as ALREADY_CLAIMED rather than a 500.
 */
export async function createClaim(input: CreateClaimInput): Promise<CreateClaimResult> {
  const [item] = await db
    .select({ userId: items.userId, titleHy: items.titleHy })
    .from(items)
    .where(
      and(eq(items.id, input.itemId), eq(items.status, 'active'), gt(items.expiresAt, sql`now()`)),
    )
    .limit(1);

  if (!item) {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }
  if (item.userId === input.userId) {
    return { ok: false, code: 'CANNOT_CLAIM_OWN_ITEM' };
  }

  try {
    const [created] = await db
      .insert(claims)
      .values({ itemId: input.itemId, userId: input.userId, message: input.message })
      .returning({ id: claims.id });

    return { ok: true, id: created.id, itemOwnerId: item.userId, itemTitleHy: item.titleHy };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 'ALREADY_CLAIMED' };
    }

    throw error;
  }
}
