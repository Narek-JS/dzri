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

/**
 * One photo, as two uploaded objects plus the layout metadata the client
 * derived from it while it had the decoded bitmap in hand.
 *
 * `width`, `height` and `blurhash` describe the *original* and are untrusted
 * client input — they are shape hints for rendering, nothing more. They are
 * validated for range and charset by the route's schema before they get here;
 * nothing downstream computes on them, and the blurhash is only ever handed to
 * a decoder.
 */
export type CreateItemImage = {
  /** The full-size upload. */
  key: string;
  /** Its 400px-longest-edge variant, which is what list views serve. */
  thumbKey: string;
  width: number;
  height: number;
  blurhash: string;
};

/** hy/ru/en — the app's three supported locales (`src/i18n/routing.ts`). */
export type ItemLocale = 'hy' | 'ru' | 'en';

export type CreateItemInput = {
  userId: string;
  /**
   * Only `sourceLocale`'s column is guaranteed non-null here. When
   * `needsTranslation` is true the other two are null until an admin fills
   * them in during moderation (`approveItem`, src/lib/items/moderate.ts).
   */
  titleHy: string | null;
  titleRu: string | null;
  titleEn: string | null;
  descriptionHy: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  needsTranslation: boolean;
  sourceLocale: ItemLocale;
  categoryId: number;
  districtId: number;
  condition: ItemCondition;
  pickupNotesHy: string | null;
  pickupNotesRu: string | null;
  pickupNotesEn: string | null;
  /** Ordered: index 0 is the thumbnail, and the array order is gallery order. */
  images: CreateItemImage[];
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
  const { userId, images } = input;

  if (images.length === 0) {
    return { ok: false, code: 'IMAGES_REQUIRED' };
  }
  if (images.length > MAX_ITEM_IMAGES) {
    return { ok: false, code: 'TOO_MANY_IMAGES' };
  }

  // Both halves of every pair are checked identically, and every check below
  // works over this flattened list. A thumb key is a key: it is minted by the
  // same presign endpoint under the same prefix, and letting it skip the
  // ownership check would reopen exactly the hole the check exists to close.
  const allKeys = images.flatMap((image) => [image.key, image.thumbKey]);

  // Ownership is the load-bearing check: without it a caller could bind
  // another user's uploaded photos onto their own listing.
  for (const key of allKeys) {
    if (!isOwnedImageKey(userId, key)) {
      return { ok: false, code: 'INVALID_IMAGE_KEY' };
    }
  }

  // One pool, not one set per role. The same key twice would create duplicate
  // gallery rows for one object, and a request naming the same object as both
  // an original and a thumbnail — including `key === thumbKey` on one image —
  // is a client that has not actually produced a variant.
  if (new Set(allKeys).size !== allKeys.length) {
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
  // exists, concurrently rather than in a loop. Both halves of every pair are
  // checked: an item whose thumb never landed would fall back to serving
  // originals on the feed, which is the cost this whole pipeline exists to
  // avoid.
  const present = await Promise.all(allKeys.map((key) => objectExists(key)));
  if (present.some((exists) => !exists)) {
    return { ok: false, code: 'IMAGE_NOT_FOUND' };
  }

  const id = randomUUID();
  // A translation request holds for review regardless of MODERATION_MODE —
  // see initialItemStatus's own doc comment for why 'post' cannot skip this.
  const status = initialItemStatus(input.needsTranslation);

  await db.batch([
    db.insert(items).values({
      id,
      userId,
      categoryId: input.categoryId,
      districtId: input.districtId,
      titleHy: input.titleHy,
      titleRu: input.titleRu,
      titleEn: input.titleEn,
      descriptionHy: input.descriptionHy,
      descriptionRu: input.descriptionRu,
      descriptionEn: input.descriptionEn,
      needsTranslation: input.needsTranslation,
      sourceLocale: input.sourceLocale,
      condition: input.condition,
      pickupNotesHy: input.pickupNotesHy,
      pickupNotesRu: input.pickupNotesRu,
      pickupNotesEn: input.pickupNotesEn,
      // Never hardcode 'active' — pre-moderation must be able to hold it.
      status,
    }),
    db.insert(itemImages).values(
      images.map((image, position) => ({
        itemId: id,
        url: publicUrl(image.key),
        thumbUrl: publicUrl(image.thumbKey),
        width: image.width,
        height: image.height,
        blurhash: image.blurhash,
        position,
      })),
    ),
  ]);

  return { ok: true, id, status };
}
