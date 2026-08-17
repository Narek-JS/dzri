import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { categories, claims, districts, itemImages, items, users } from '@/db/schema';
import type { ItemCondition, ItemStatus } from '@/db/schema';
import type { Session } from '@/lib/auth/session';

import type { ItemLocale } from './create';

/** The claim statuses that entitle their holder to keep reading the item. */
const ENTITLED_CLAIM_STATUSES = ['approved', 'completed'] as const;

export type VisibleItemImage = {
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  position: number;
};

/**
 * Everything about an item a viewer who may see it at all is allowed to
 * read. `rejectionReason` and `ownerId` are here for a caller that needs
 * them — a route handler or page that is not the owner never renders
 * them — but neither is a phone, which is never selected by this query
 * for anyone (CLAUDE.md Rule 1).
 */
export type VisibleItem = {
  id: string;
  /**
   * Raw per-locale columns, unresolved — unlike the feed, this item is not
   * guaranteed `active` (the owner may be looking at their own
   * `pending_review` or `rejected` listing), so two of the three can be
   * `null`. Callers resolve with `resolveLocalizedText` (src/lib/items/
   * localizedText.ts), falling back to `sourceLocale`'s column.
   */
  titleHy: string | null;
  titleRu: string | null;
  titleEn: string | null;
  descriptionHy: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  sourceLocale: ItemLocale;
  condition: ItemCondition;
  pickupNotes: string | null;
  status: ItemStatus;
  rejectionReason: string | null;
  createdAt: Date;
  expiresAt: Date;
  images: VisibleItemImage[];
  district: { slug: string; nameHy: string; nameRu: string; nameEn: string };
  category: { slug: string; nameHy: string; nameRu: string; nameEn: string };
  giver: { displayName: string; avatarUrl: string | null };
  ownerId: string;
};

export type ItemView = {
  item: VisibleItem;
  isOwner: boolean;
  isEntitledClaimant: boolean;
  /** `isOwner || isEntitledClaimant` — true when the response may never land in a shared cache. */
  isPrivateView: boolean;
};

/**
 * Who may read one item, and what they get.
 *
 * PUBLIC when the item is `active` and unexpired. Two other people may read
 * it in *any* status:
 *
 *  - the OWNER, so they can see their own pending or rejected listing;
 *  - a CLAIMANT holding an `approved` or `completed` claim on it. Approving a
 *    claim moves the item to `reserved`, which is not public — without this
 *    the claimant's own approved claim would dead-end at a 404 the moment
 *    they were picked. A `rejected` or `withdrawn` claimant gets nothing:
 *    holding a claim once is not a standing key to a listing that is no
 *    longer public (DECISIONS.md, 2026-08-08).
 *
 * Everyone else gets `null` — the caller renders that as a 404, never a 403,
 * so a rejected or reserved id cannot be distinguished from one that never
 * existed. A malformed uuid is also `null`.
 *
 * `view_count` increments on public fetches only — not the owner, not the
 * claimant — guarded on `status = 'active'` so a race that moves the item out
 * of `active` between the read and the write cannot bump a non-visible row.
 * This is the one side effect in an otherwise read-only function: every
 * caller that renders an item to a viewer (the API route, the detail page)
 * is a real view and should count as one.
 */
export async function getItemForViewer(
  id: string,
  session: Session | null,
): Promise<ItemView | null> {
  if (!z.string().uuid().safeParse(id).success) {
    return null;
  }

  const [row] = await db
    .select({
      id: items.id,
      userId: items.userId,
      titleHy: items.titleHy,
      titleRu: items.titleRu,
      titleEn: items.titleEn,
      descriptionHy: items.descriptionHy,
      descriptionRu: items.descriptionRu,
      descriptionEn: items.descriptionEn,
      sourceLocale: items.sourceLocale,
      condition: items.condition,
      pickupNotes: items.pickupNotes,
      status: items.status,
      rejectionReason: items.rejectionReason,
      createdAt: items.createdAt,
      expiresAt: items.expiresAt,
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
      giver: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .innerJoin(users, eq(items.userId, users.id))
    .where(eq(items.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const isOwner = session?.userId === row.userId;
  const isPublic = row.status === 'active' && row.expiresAt.getTime() > Date.now();

  // Only asked when it can change the answer: a signed-in stranger looking at
  // an item that is not public. The anonymous path and the ordinary public
  // path stay exactly as cheap as they were.
  const isEntitledClaimant =
    !isOwner && !isPublic && session ? await hasEntitlingClaim(id, session.userId) : false;

  if (!isOwner && !isPublic && !isEntitledClaimant) {
    return null;
  }

  const isPrivateView = isOwner || isEntitledClaimant;

  // A gallery, not a list view, so it gets both: `thumbUrl` for the strip and
  // the first paint, `url` for the full-size view. `thumbUrl` is null on rows
  // written before the two-variant pipeline — the caller falls back to `url`.
  const images = await db
    .select({
      url: itemImages.url,
      thumbUrl: itemImages.thumbUrl,
      width: itemImages.width,
      height: itemImages.height,
      blurhash: itemImages.blurhash,
      position: itemImages.position,
    })
    .from(itemImages)
    .where(eq(itemImages.itemId, id))
    .orderBy(asc(itemImages.position));

  if (!isPrivateView) {
    await db
      .update(items)
      .set({ viewCount: sql`${items.viewCount} + 1` })
      .where(and(eq(items.id, id), eq(items.status, 'active')));
  }

  return {
    item: {
      id: row.id,
      titleHy: row.titleHy,
      titleRu: row.titleRu,
      titleEn: row.titleEn,
      descriptionHy: row.descriptionHy,
      descriptionRu: row.descriptionRu,
      descriptionEn: row.descriptionEn,
      // `source_locale` is plain `text`, not a Postgres enum — createItem
      // only ever writes one of the three locales into it.
      sourceLocale: row.sourceLocale as ItemLocale,
      condition: row.condition,
      pickupNotes: row.pickupNotes,
      status: row.status,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      images,
      district: row.district,
      category: row.category,
      giver: row.giver,
      ownerId: row.userId,
    },
    isOwner,
    isEntitledClaimant,
    isPrivateView,
  };
}

/**
 * Does this user hold a claim on this item that entitles them to keep
 * reading it after it stops being public?
 *
 * `approved` and `completed` only. Selects nothing but a literal: the answer
 * is the existence of the row, and selecting a column here would put claim
 * data on a code path whose response has no business carrying any.
 */
async function hasEntitlingClaim(itemId: string, userId: string): Promise<boolean> {
  const [claim] = await db
    .select({ present: sql<number>`1` })
    .from(claims)
    .where(
      and(
        eq(claims.itemId, itemId),
        eq(claims.userId, userId),
        inArray(claims.status, ENTITLED_CLAIM_STATUSES),
      ),
    )
    .limit(1);

  return Boolean(claim);
}
