import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { categories, districts, itemImages, items } from '@/db/schema';
import type { ItemCondition, ItemStatus } from '@/db/schema';
import { initialItemStatus } from '@/lib/moderation';
import { headObject, publicUrl } from '@/lib/r2';

import { isOwnedImageKey } from './imageKeys';

/** A listing with no photo does not get claimed, and six is plenty. */
export const MAX_ITEM_IMAGES = 6;

export type CreateItemInput = {
  userId: string;
  title: string;
  description: string | null;
  categoryId: number;
  districtId: number;
  condition: ItemCondition;
  pickupNotes: string | null;
  /** Ordered: index 0 is the thumbnail, and the array order is gallery order. */
  imageKeys: string[];
};

/**
 * Every failure here maps 1:1 onto an `ApiErrorCode`, so the route handler can
 * hand the code straight to `apiError` without a translation table.
 */
export type CreateItemErrorCode =
  | 'IMAGES_REQUIRED'
  | 'TOO_MANY_IMAGES'
  | 'INVALID_IMAGE_KEY'
  | 'IMAGE_NOT_FOUND'
  | 'INVALID_CATEGORY'
  | 'INVALID_DISTRICT';

export type CreateItemResult =
  { ok: true; id: string; status: ItemStatus } | { ok: false; code: CreateItemErrorCode };

/**
 * Validates an item and writes it, with its images, in one transaction.
 *
 * Checks run cheapest-first so a bad request is rejected before it costs a
 * database round trip or an R2 call: image count, then the ownership/shape of
 * every key, then duplicates — all pure — before touching the reference
 * tables or the bucket.
 *
 * The write uses `db.batch`, not `db.transaction`: the neon-http driver has
 * no interactive transaction, but `batch` runs its statements together in a
 * single atomic transaction over one HTTP round trip. Because a batch cannot
 * feed one statement's result into the next, the item id is generated here in
 * application code and shared between the item row and its image rows, rather
 * than read back from an `insert ... returning`.
 *
 * `objectExists` defaults to the real R2 `headObject` and production must
 * leave it at the default — the route does. It is a parameter only so the
 * integration suite, whose server runs on throwaway R2 config, can inject a
 * stub for the existence step without a live bucket. Everything else it
 * exercises is real.
 */
export async function createItem(
  input: CreateItemInput,
  objectExists: (key: string) => Promise<boolean> = headObject,
): Promise<CreateItemResult> {
  const { userId, imageKeys } = input;

  if (imageKeys.length === 0) {
    return { ok: false, code: 'IMAGES_REQUIRED' };
  }
  if (imageKeys.length > MAX_ITEM_IMAGES) {
    return { ok: false, code: 'TOO_MANY_IMAGES' };
  }

  // Ownership is the load-bearing check: without it a caller could bind
  // another user's uploaded photos onto their own listing.
  for (const key of imageKeys) {
    if (!isOwnedImageKey(userId, key)) {
      return { ok: false, code: 'INVALID_IMAGE_KEY' };
    }
  }

  // The same key twice would create duplicate gallery rows for one object.
  if (new Set(imageKeys).size !== imageKeys.length) {
    return { ok: false, code: 'INVALID_IMAGE_KEY' };
  }

  const [category, district] = await Promise.all([
    db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1),
    db
      .select({ id: districts.id })
      .from(districts)
      .where(eq(districts.id, input.districtId))
      .limit(1),
  ]);

  if (category.length === 0) {
    return { ok: false, code: 'INVALID_CATEGORY' };
  }
  if (district.length === 0) {
    return { ok: false, code: 'INVALID_DISTRICT' };
  }

  // A key can pass the ownership check yet never have been uploaded — a
  // presign that the client abandoned. HeadObject confirms each object
  // exists, concurrently rather than in a loop.
  const present = await Promise.all(imageKeys.map((key) => objectExists(key)));
  if (present.some((exists) => !exists)) {
    return { ok: false, code: 'IMAGE_NOT_FOUND' };
  }

  const id = randomUUID();
  const status = initialItemStatus();

  await db.batch([
    db.insert(items).values({
      id,
      userId,
      categoryId: input.categoryId,
      districtId: input.districtId,
      title: input.title,
      description: input.description,
      condition: input.condition,
      pickupNotes: input.pickupNotes,
      // Never hardcode 'active' — pre-moderation must be able to hold it.
      status,
    }),
    db.insert(itemImages).values(
      imageKeys.map((key, position) => ({
        itemId: id,
        url: publicUrl(key),
        position,
      })),
    ),
  ]);

  return { ok: true, id, status };
}
