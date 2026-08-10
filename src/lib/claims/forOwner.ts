import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { claims, items, userReliability, users } from '@/db/schema';

import type { ClaimStatus, ItemStatus } from '@/db/schema';

export type OwnerClaim = {
  id: string;
  status: ClaimStatus;
  message: string | null;
  createdAt: Date;
  claimant: {
    displayName: string;
    avatarUrl: string | null;
    reliability: { completed: number; noShows: number };
    /** Present only when `status === 'approved'` — absent otherwise, never `null`. */
    phone?: string;
  };
};

export type OwnerItemSummary = {
  id: string;
  title: string;
  status: ItemStatus;
  reservedUntil: Date | null;
};

export type ClaimsForOwner = { item: OwnerItemSummary; claims: OwnerClaim[] };

/**
 * The giver's decision list for one item: every claim, oldest first, each
 * carrying the claimant's reliability history and — only on an `approved`
 * claim — their phone.
 *
 * Extracted out of `GET /api/items/[id]/claims` the way `getFeed` and
 * `getPendingQueue` were extracted, so the claims page
 * (`[locale]/items/[id]/claims/page.tsx`) can read the same rows the route
 * handler would return without making an HTTP request to itself. The route
 * handler still owns auth and the response envelope; this function owns the
 * ownership check (returns `null` for a missing item or a non-owner — the
 * same 404 either way, so a stranger cannot learn an id is real) and the uuid
 * check (a malformed id can never name an item someone owns).
 *
 * PHONE PRIVACY. The phone is emitted by the *database*, in a CASE guarded on
 * `status = 'approved'` (DECISIONS.md, 2026-08-07), so a pending or rejected
 * row has no phone to leak by the time it reaches this process. The key is
 * then omitted entirely rather than sent as `null`, so a list of pending
 * claims carries no phone field at all.
 */
export async function getClaimsForOwner(
  itemId: string,
  ownerId: string,
): Promise<ClaimsForOwner | null> {
  if (!z.string().uuid().safeParse(itemId).success) {
    return null;
  }

  const [item] = await db
    .select({
      id: items.id,
      userId: items.userId,
      title: items.title,
      status: items.status,
      reservedUntil: items.reservedUntil,
    })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);

  // Missing item and somebody else's item are the same refusal.
  if (!item || item.userId !== ownerId) {
    return null;
  }

  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      message: claims.message,
      createdAt: claims.createdAt,
      claimantId: claims.userId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      phone: sql<string | null>`case when ${claims.status} = 'approved' then ${users.phone} end`,
    })
    .from(claims)
    .innerJoin(users, eq(claims.userId, users.id))
    .where(eq(claims.itemId, itemId))
    .orderBy(asc(claims.createdAt), asc(claims.id));

  const claimantIds = [...new Set(rows.map((row) => row.claimantId))];

  // Queried by id rather than joined: `user_reliability` aggregates over every
  // user, and an explicit `in` list is a filter Postgres pushes down into the
  // grouping instead of materializing the whole view. The view carries an id
  // and two counts and nothing else — the phone on this page comes from the
  // status-guarded case above, never from here.
  const reliabilityRows = claimantIds.length
    ? await db
        .select({
          id: userReliability.id,
          completed: userReliability.completed,
          noShows: userReliability.noShows,
        })
        .from(userReliability)
        .where(inArray(userReliability.id, claimantIds))
    : [];

  const reliabilityByUser = new Map(reliabilityRows.map((row) => [row.id, row]));

  const claimList: OwnerClaim[] = rows.map((row) => {
    const reliability = reliabilityByUser.get(row.claimantId);

    return {
      id: row.id,
      status: row.status,
      message: row.message,
      createdAt: row.createdAt,
      claimant: {
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        reliability: {
          completed: reliability?.completed ?? 0,
          noShows: reliability?.noShows ?? 0,
        },
        ...(row.phone ? { phone: row.phone } : {}),
      },
    };
  });

  return {
    item: {
      id: item.id,
      title: item.title,
      status: item.status,
      reservedUntil: item.reservedUntil,
    },
    claims: claimList,
  };
}
