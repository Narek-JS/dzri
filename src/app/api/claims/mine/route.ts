import { NextResponse } from 'next/server';

import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { requireUser } from '@/lib/auth/session';
import { db } from '@/db';
import { claims, itemImages, items, users } from '@/db/schema';
import { apiError } from '@/lib/http';

/** One screen of claims. The client asks for the next page with `nextCursor`. */
const PAGE_SIZE = 20;

/**
 * GET /api/claims/mine — everything the caller has asked for, newest first.
 *
 * The claimant's side of the interaction: what did I ask for, was I picked,
 * and if I was, who do I call.
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

  const where = cursor
    ? and(eq(claims.userId, user.id), lt(claims.createdAt, cursor))
    : eq(claims.userId, user.id);

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      message: claims.message,
      createdAt: claims.createdAt,
      itemId: items.id,
      itemTitle: items.title,
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
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  const list = page.map((row) => ({
    id: row.id,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt,
    item: {
      id: row.itemId,
      title: row.itemTitle,
      status: row.itemStatus,
      thumbnailUrl: row.thumbnailUrl,
    },
    giver: {
      displayName: row.giverDisplayName,
      ...(row.giverPhone ? { phone: row.giverPhone } : {}),
    },
  }));

  return NextResponse.json(
    { claims: list, nextCursor },
    // A user's own list — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
