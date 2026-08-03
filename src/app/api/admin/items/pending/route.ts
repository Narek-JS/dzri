import { NextResponse } from 'next/server';

import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/db';
import { categories, districts, itemImages, items, users } from '@/db/schema';
import { apiError } from '@/lib/http';

/** One screen of the moderation queue. The client asks for more with `nextCursor`. */
const PAGE_SIZE = 20;

/**
 * GET /api/admin/items/pending — the moderation work queue.
 *
 * ADMIN ONLY. A non-admin (anonymous or a logged-in stranger) gets 404, not
 * 403, so the surface is not discoverable by probing paths.
 *
 * This is a work queue, not a feed: OLDEST first, so the submission that has
 * waited longest is reviewed first. Paginated on `createdAt` ascending.
 *
 * The giver's prior approved/rejected counts ride along with each item —
 * that history is what makes a repeat spammer obvious at a glance. The
 * giver's phone is never selected, here or anywhere (CLAUDE.md).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const cursorParam = new URL(request.url).searchParams.get('cursor');
  const cursor = cursorParam ? new Date(cursorParam) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return apiError('INVALID_BODY');
  }

  // Strictly-greater on createdAt walks the queue forward in time. The
  // matching index is `items_pending_review_created_at_idx`.
  const where = cursor
    ? and(eq(items.status, 'pending_review'), gt(items.createdAt, cursor))
    : eq(items.status, 'pending_review');

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: items.id,
      userId: items.userId,
      title: items.title,
      description: items.description,
      condition: items.condition,
      pickupNotes: items.pickupNotes,
      createdAt: items.createdAt,
      district: {
        slug: districts.slug,
        nameHy: districts.nameHy,
        nameRu: districts.nameRu,
        nameEn: districts.nameEn,
      },
      category: {
        slug: categories.slug,
        nameHy: categories.nameHy,
        nameRu: categories.nameRu,
        nameEn: categories.nameEn,
      },
      giverDisplayName: users.displayName,
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .innerJoin(users, eq(items.userId, users.id))
    .where(where)
    .orderBy(asc(items.createdAt), asc(items.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  const itemIds = page.map((row) => row.id);
  const giverIds = [...new Set(page.map((row) => row.userId))];

  // All images for the page, ordered so a per-item slice stays in position
  // order once grouped. A join on the main query would multiply item rows.
  const imageRows = itemIds.length
    ? await db
        .select({ itemId: itemImages.itemId, url: itemImages.url })
        .from(itemImages)
        .where(inArray(itemImages.itemId, itemIds))
        .orderBy(asc(itemImages.itemId), asc(itemImages.position))
    : [];

  const imagesByItem = new Map<string, string[]>();
  for (const { itemId, url } of imageRows) {
    const list = imagesByItem.get(itemId);
    if (list) list.push(url);
    else imagesByItem.set(itemId, [url]);
  }

  // The giver's moderation history, in one grouped query over their items.
  // Approved = reviewed and not rejected (this holds even after the item
  // later moves to reserved/given/expired, which keep reviewed_at set).
  // Rejected = terminal `rejected`. The still-pending items in this queue
  // have no reviewed_at, so they count toward neither — these are *prior*
  // decisions.
  const historyRows = giverIds.length
    ? await db
        .select({
          userId: items.userId,
          approved: sql<number>`count(*) filter (where ${items.reviewedAt} is not null and ${items.status} <> 'rejected')::int`,
          rejected: sql<number>`count(*) filter (where ${items.status} = 'rejected')::int`,
        })
        .from(items)
        .where(inArray(items.userId, giverIds))
        .groupBy(items.userId)
    : [];

  const historyByGiver = new Map(historyRows.map((row) => [row.userId, row]));

  const queue = page.map((row) => {
    const history = historyByGiver.get(row.userId);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      condition: row.condition,
      pickupNotes: row.pickupNotes,
      createdAt: row.createdAt,
      images: imagesByItem.get(row.id) ?? [],
      district: row.district,
      category: row.category,
      giver: {
        displayName: row.giverDisplayName,
        approvedCount: history?.approved ?? 0,
        rejectedCount: history?.rejected ?? 0,
      },
    };
  });

  return NextResponse.json(
    { items: queue, nextCursor },
    // A moderator's working view — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
