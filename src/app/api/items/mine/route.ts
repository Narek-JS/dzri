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
 * The thumbnail and the claim count are correlated subqueries rather than
 * joins so the page stays one row per item: a join to item_images would
 * multiply rows, and a join to claims would need a group-by. The image
 * subquery takes position 0, which is the thumbnail by construction.
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

  const thumbnailUrl = sql<string | null>`(
    select ${itemImages.url}
    from ${itemImages}
    where ${itemImages.itemId} = ${items.id}
    order by ${itemImages.position} asc
    limit 1
  )`;

  const claimCount = sql<number>`(
    select count(*)::int
    from ${claims}
    where ${claims.itemId} = ${items.id}
  )`;

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
      claimCount,
    })
    .from(items)
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
