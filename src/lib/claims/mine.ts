import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { claims, itemImages, items, users } from '@/db/schema';

import type { ClaimRejectedReason, ClaimStatus, ItemStatus } from '@/db/schema';

/** One screen of claims. The caller asks for the next page with `nextCursor`. */
export const MY_CLAIMS_PAGE_SIZE = 20;

export type MyClaimRow = {
  id: string;
  status: ClaimStatus;
  /**
   * Which of the three routes to `rejected` this claim took. Present only when
   * `status === 'rejected'` — absent otherwise, never `null`, the same shape as
   * `giver.phone` and for the same reason (DECISIONS.md, 2026-08-07).
   *
   * The column is null for every non-rejected claim by check constraint, not by
   * convention, so this key cannot appear on one.
   */
  rejectedReason?: ClaimRejectedReason;
  message: string | null;
  createdAt: Date;
  item: {
    id: string;
    /**
     * All three, unresolved. A claim can only be created while
     * `status = 'active'` (`createClaim`'s own guard), and
     * `item_translations_complete_when_active` never lets these columns go
     * null again afterward, so this is guaranteed regardless of the item's
     * status by the time this claim is read.
     */
    titleHy: string;
    titleRu: string;
    titleEn: string;
    status: ItemStatus;
    thumbnailUrl: string | null;
  };
  giver: {
    displayName: string;
    /** Present only when `status === 'approved'` — absent otherwise, never `null`. */
    phone?: string;
  };
};

export type MyClaimsPage = { claims: MyClaimRow[]; nextCursor: string | null };

/**
 * The claimant's own list: everything this user has asked for, newest first,
 * every status mixed together — a history, not a work queue.
 *
 * Extracted out of `GET /api/claims/mine` the way `getClaimsForOwner` was
 * extracted from `GET /api/items/[id]/claims`, so the my-claims page
 * (`[locale]/my/claims/page.tsx`) can read the same rows the route handler
 * would return without making an HTTP request to itself. The route handler
 * still owns auth, cursor validation and the response envelope; this function
 * owns the query. `cursor` is assumed already validated by the caller.
 *
 * The thumbnail is a correlated subquery (position 0) rather than a join, so
 * the result stays one row per claim — a join to item_images would multiply
 * rows.
 *
 * PHONE PRIVACY. The giver's phone is emitted by the *database* inside a CASE
 * guarded on `status = 'approved'`, so a pending, rejected or withdrawn claim
 * has no phone to leak by the time the row reaches this process. The key is
 * then omitted entirely unless it has a value, so a page of pending claims
 * carries no phone field at all.
 */
export async function getMyClaims(userId: string, cursor: Date | null): Promise<MyClaimsPage> {
  // `thumb_url` is the 400px variant the client uploaded alongside the
  // original; `url` is the original itself. This list used to select `url`
  // outright — the last list view in the product still serving originals
  // (API.md, "Known gaps") — which is the single largest way this page can
  // spend egress, the product's main variable cost (CLAUDE.md: never serve an
  // original in a list view). The coalesce matches `getFeed` exactly, and is
  // what keeps rows written before the two-variant pipeline rendering at all;
  // those are not backfilled, so they still cost what they always did.
  const thumbnailUrl = sql<string | null>`(
    select coalesce(${itemImages.thumbUrl}, ${itemImages.url})
    from ${itemImages}
    where ${itemImages.itemId} = ${items.id}
    order by ${itemImages.position} asc
    limit 1
  )`;

  const where = cursor
    ? and(eq(claims.userId, userId), lt(claims.createdAt, cursor))
    : eq(claims.userId, userId);

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      rejectedReason: claims.rejectedReason,
      message: claims.message,
      createdAt: claims.createdAt,
      itemId: items.id,
      itemTitleHy: items.titleHy,
      itemTitleRu: items.titleRu,
      itemTitleEn: items.titleEn,
      itemStatus: items.status,
      thumbnailUrl,
      giverDisplayName: users.displayName,
      giverPhone: sql<
        string | null
      >`case when ${claims.status} = 'approved' then ${users.phone} end`,
    })
    .from(claims)
    .innerJoin(items, eq(claims.itemId, items.id))
    .innerJoin(users, eq(items.userId, users.id))
    .where(where)
    .orderBy(desc(claims.createdAt), desc(claims.id))
    .limit(MY_CLAIMS_PAGE_SIZE + 1);

  const hasMore = rows.length > MY_CLAIMS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, MY_CLAIMS_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  const claimList: MyClaimRow[] = page.map((row) => ({
    id: row.id,
    status: row.status,
    ...(row.rejectedReason ? { rejectedReason: row.rejectedReason } : {}),
    message: row.message,
    createdAt: row.createdAt,
    item: {
      id: row.itemId,
      // See MyClaimRow's `item` field doc comment above for why these are
      // safe to assert non-null: this claim exists, so the item was
      // `active` at some point.
      titleHy: row.itemTitleHy as string,
      titleRu: row.itemTitleRu as string,
      titleEn: row.itemTitleEn as string,
      status: row.itemStatus,
      thumbnailUrl: row.thumbnailUrl,
    },
    giver: {
      displayName: row.giverDisplayName,
      ...(row.giverPhone ? { phone: row.giverPhone } : {}),
    },
  }));

  return { claims: claimList, nextCursor };
}
