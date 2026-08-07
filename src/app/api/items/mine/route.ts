import { NextResponse } from 'next/server';

import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { requireUser } from '@/lib/auth/session';
import { db } from '@/db';
import { claims, itemImages, items } from '@/db/schema';
import { apiError } from '@/lib/http';

/** One screen of items. The client asks for the next page with `nextCursor`. */
const PAGE_SIZE = 20;

/**
 * The caller's own items, newest first — the "my items" screen, including why
 * a rejected item was rejected.
 *
 * The thumbnail is a correlated subquery and the claim counts a correlated
 * lateral, rather than plain joins, so the page stays one row per item: a join
 * to item_images would multiply rows, and a join to claims would need a
 * group-by over the whole table. The image subquery takes position 0, which is
 * the thumbnail by construction.
 *
 * No phone number is selected on any path here — these are the caller's own
 * listings, and a claimant's identity is not part of this view.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const cursorParam = new URL(request.url).searchParams.get('cursor');
  const cursor = cursorParam ? new Date(cursorParam) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return apiError('INVALID_BODY');
  }

  // The 400px variant where there is one, the original where there is not —
  // rows predating the two-variant pipeline are never backfilled. This is a
  // list view, so it must not serve an original (CLAUDE.md).
  const thumbnailUrl = sql<string | null>`(
    select coalesce(${itemImages.thumbUrl}, ${itemImages.url})
    from ${itemImages}
    where ${itemImages.itemId} = ${items.id}
    order by ${itemImages.position} asc
    limit 1
  )`;

  // Both counts come out of ONE correlated aggregate, joined laterally, rather
  // than a scalar subquery each: a scalar subquery can only return one column,
  // so two of them would walk `claims_item_id_status_created_at_idx` twice per
  // row for numbers that are two `count(*)`s over the same scan. The lateral is
  // still correlated on `item_id`, so it stays an index lookup per item and
  // never aggregates the whole claims table.
  //
  // `claimCount` is every claim ever, whatever became of it — unchanged, the
  // client already reads it. `pendingClaimCount` is the actionable one: how
  // many people are waiting on a decision right now.
  const claimCounts = db
    .select({
      total: sql<number>`count(*)::int`.as('total'),
      pending: sql<number>`count(*) filter (where ${claims.status} = 'pending')::int`.as('pending'),
    })
    .from(claims)
    .where(eq(claims.itemId, items.id))
    .as('claim_counts');

  const where = cursor
    ? and(eq(items.userId, user.id), lt(items.createdAt, cursor))
    : eq(items.userId, user.id);

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      status: items.status,
      rejectionReason: items.rejectionReason,
      createdAt: items.createdAt,
      expiresAt: items.expiresAt,
      imageUrl: thumbnailUrl,
      claimCount: claimCounts.total,
      pendingClaimCount: claimCounts.pending,
    })
    .from(items)
    // An aggregate with no GROUP BY always yields exactly one row — zeroes for
    // an item nobody has claimed — so this never drops or multiplies an item.
    .leftJoinLateral(claimCounts, sql`true`)
    .where(where)
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return NextResponse.json(
    { items: page, nextCursor },
    // A user's own list — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
