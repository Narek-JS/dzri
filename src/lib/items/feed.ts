import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { categories, districts, itemImages, items } from '@/db/schema';

import type { ItemCondition } from '@/db/schema';

/** One screen of the public feed. The client asks for more with `nextCursor`. */
const FEED_PAGE_SIZE = 24;

export type FeedFilters = {
  district?: string;
  category?: string;
  condition?: ItemCondition;
  /** ISO timestamp from a previous page's `nextCursor`. Not validated here — see below. */
  cursor?: string;
};

export type FeedItemRow = {
  id: string;
  /**
   * All three, unresolved — mirroring `district`/`category` below, since the
   * feed is only ever `active` items and `item_translations_complete_when_
   * active` (src/db/schema/items.ts) guarantees every one is non-null.
   */
  titleHy: string;
  titleRu: string;
  titleEn: string;
  condition: ItemCondition;
  createdAt: Date;
  thumbnailUrl: string | null;
  district: { slug: string; nameHy: string; nameRu: string; nameEn: string };
  category: { slug: string; nameHy: string; nameRu: string; nameEn: string };
};

export type FeedPage = { items: FeedItemRow[]; nextCursor: string | null };

/**
 * The public feed: active, unexpired items, newest first.
 *
 * Extracted out of `GET /api/items` the way `getItemForViewer` was extracted
 * for the item detail page, so the feed page (`[locale]/page.tsx`) can read
 * the same rows the route handler would return without making an HTTP
 * request to itself. The route handler still owns auth-free public access,
 * rate limiting, and request parsing/validation — `filters` here is assumed
 * already validated by the caller. The feed page's caller is looser on
 * purpose: a URL is user-editable, so it treats an unparseable `condition`
 * as absent rather than surfacing an error (API.md: a stale or hand-edited
 * link must never break).
 *
 * The thumbnail is a correlated subquery (position 0), not a join, so the
 * result stays one row per item — a join to item_images would multiply rows.
 * District and category are joined instead, because those are one-to-one and
 * the feed needs all three localized names of each anyway.
 */
export async function getFeed(filters: FeedFilters): Promise<FeedPage> {
  const { district, category, condition, cursor } = filters;

  // `thumb_url` is the 400px variant the client uploaded alongside the
  // original; `url` is the original itself. Rows written before the
  // two-variant pipeline have no variant and are not backfilled, so the
  // coalesce is what keeps them rendering — at the old cost, on those rows
  // only. Serving `url` here for everything would be the single largest way
  // this product can spend egress (CLAUDE.md: never serve an original in a
  // list view).
  const thumbnailUrl = sql<string | null>`(
    select coalesce(${itemImages.thumbUrl}, ${itemImages.url})
    from ${itemImages}
    where ${itemImages.itemId} = ${items.id}
    order by ${itemImages.position} asc
    limit 1
  )`;

  // Reserved items are deliberately excluded (a viewer should not see something
  // already spoken for), as is everything that is not `active`.
  const whereClauses = [eq(items.status, 'active'), gt(items.expiresAt, sql`now()`)];
  if (cursor) whereClauses.push(lt(items.createdAt, new Date(cursor)));
  // An unknown slug matches nothing here — that is the empty-page behavior, not
  // an error path.
  if (district) whereClauses.push(eq(districts.slug, district));
  if (category) whereClauses.push(eq(categories.slug, category));
  if (condition) whereClauses.push(eq(items.condition, condition));

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: items.id,
      titleHy: items.titleHy,
      titleRu: items.titleRu,
      titleEn: items.titleEn,
      condition: items.condition,
      createdAt: items.createdAt,
      thumbnailUrl,
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
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .where(and(...whereClauses))
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(FEED_PAGE_SIZE + 1);

  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  // The title columns are nullable at the schema level (a pending or
  // rejected item may be missing two of them), but this query only ever
  // selects `active` rows, and item_translations_complete_when_active
  // guarantees an `active` row has all three — an invariant TypeScript can't
  // see through the column's nullable type, hence the assertion.
  const resolvedItems: FeedItemRow[] = page.map((row) => ({
    ...row,
    titleHy: row.titleHy as string,
    titleRu: row.titleRu as string,
    titleEn: row.titleEn as string,
  }));

  return { items: resolvedItems, nextCursor };
}
