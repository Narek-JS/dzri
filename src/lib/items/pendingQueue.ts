import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { categories, categoryGroups, districts, itemImages, items, users } from '@/db/schema';

import type { ItemLocale } from './create';
import type { ItemCondition } from '@/db/schema';

/** One screen of the moderation queue. The client asks for more with `nextCursor`. */
const PENDING_QUEUE_PAGE_SIZE = 20;

/**
 * Raw per-locale title/description, not resolved to one string — the
 * reviewer needs to see which locales are actually filled to fill in the
 * rest (PART 4), the opposite of every public-facing item shape.
 */
export type PendingQueueItem = {
  id: string;
  titleHy: string | null;
  titleRu: string | null;
  titleEn: string | null;
  descriptionHy: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  needsTranslation: boolean;
  sourceLocale: ItemLocale;
  condition: ItemCondition;
  pickupNotes: string | null;
  createdAt: Date;
  images: string[];
  district: { slug: string; nameHy: string; nameRu: string; nameEn: string };
  /**
   * Carries its group's three names too — CLAUDE.md's category restructure
   * asks the moderation queue to show which group a category belongs to, a
   * display-only addition, not a picker (the queue never lets an admin
   * change a category).
   */
  category: {
    slug: string;
    nameHy: string;
    nameRu: string;
    nameEn: string;
    groupNameHy: string;
    groupNameRu: string;
    groupNameEn: string;
  };
  giver: { displayName: string; approvedCount: number; rejectedCount: number };
};

export type PendingQueuePage = { items: PendingQueueItem[]; nextCursor: string | null };

/**
 * The moderation work queue: `pending_review` items, oldest first.
 *
 * Extracted out of `GET /api/admin/items/pending` the way `getFeed` was
 * extracted for the public feed, so the admin page (`[locale]/admin/page.tsx`)
 * can read the same rows the route handler would return without making an
 * HTTP request to itself. The route handler still owns admin auth, cursor
 * parsing/validation and the response envelope — `cursor` here is assumed
 * already validated by the caller (CLAUDE.md: do not call admin endpoints
 * over HTTP from a server component).
 *
 * The giver's prior approved/rejected counts ride along with each item —
 * that history is what makes a repeat spammer obvious at a glance. The
 * giver's phone is never selected, here or anywhere (CLAUDE.md).
 */
export async function getPendingQueue(cursor: Date | null): Promise<PendingQueuePage> {
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
      titleHy: items.titleHy,
      titleRu: items.titleRu,
      titleEn: items.titleEn,
      descriptionHy: items.descriptionHy,
      descriptionRu: items.descriptionRu,
      descriptionEn: items.descriptionEn,
      needsTranslation: items.needsTranslation,
      sourceLocale: items.sourceLocale,
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
        groupNameHy: categoryGroups.nameHy,
        groupNameRu: categoryGroups.nameRu,
        groupNameEn: categoryGroups.nameEn,
      },
      giverDisplayName: users.displayName,
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .innerJoin(users, eq(items.userId, users.id))
    .where(where)
    .orderBy(asc(items.createdAt), asc(items.id))
    .limit(PENDING_QUEUE_PAGE_SIZE + 1);

  const hasMore = rows.length > PENDING_QUEUE_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PENDING_QUEUE_PAGE_SIZE) : rows;
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
      titleHy: row.titleHy,
      titleRu: row.titleRu,
      titleEn: row.titleEn,
      descriptionHy: row.descriptionHy,
      descriptionRu: row.descriptionRu,
      descriptionEn: row.descriptionEn,
      needsTranslation: row.needsTranslation,
      // `source_locale` is plain `text`, not a Postgres enum — createItem
      // only ever writes one of the three locales into it (CLAUDE.md's i18n
      // rule), so this cast reflects an application invariant, not a
      // database one.
      sourceLocale: row.sourceLocale as ItemLocale,
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

  return { items: queue, nextCursor };
}
