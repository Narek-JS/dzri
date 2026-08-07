import { randomUUID } from 'node:crypto';

import { ALLOWED_IMAGE_CONTENT_TYPES, isAllowedContentType } from '@/lib/images/contentTypes';
import type { AllowedContentType } from '@/lib/images/contentTypes';

// The allowlist itself lives in `src/lib/images/` so the browser-side
// compressor can share it without pulling `node:crypto` and the S3 SDK into
// the client bundle. Re-exported here because this is where the server has
// always reached for it.
export { ALLOWED_IMAGE_CONTENT_TYPES, isAllowedContentType };
export type { AllowedContentType };

/**
 * An upload is one of two things, and the difference is a byte ceiling.
 *
 * `original` is the photo itself. `thumb` is the 400px-longest-edge variant
 * the client derives from it, which is what every list view serves — egress is
 * this product's main variable cost (CLAUDE.md), and a feed of full-size
 * photos is the single largest way to spend it.
 *
 * Nothing on the server *looks* at the bytes: the client asserts which is
 * which, and R2 receives whatever it PUTs. The cap is therefore the only
 * server-side control over what a "thumb" can be. 256 KB is several times what
 * a 400px JPEG needs and still two orders of magnitude below an original, so a
 * client that quietly uploaded a full photo as a thumb would be refused before
 * it ever got a signature.
 */
export const IMAGE_VARIANTS = ['original', 'thumb'] as const;

export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

/**
 * 8 MB. Bound into the presigned request so a client cannot upload more
 * than it declared. Egress is this product's main variable cost
 * (CLAUDE.md), so the ceiling is intentionally low.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 256 KB — a generous ceiling for 400px on its longest edge. */
export const MAX_THUMB_BYTES = 256 * 1024;

export function maxBytesForVariant(variant: ImageVariant): number {
  return variant === 'thumb' ? MAX_THUMB_BYTES : MAX_IMAGE_BYTES;
}

/**
 * Object key for an uploaded image: `uploads/{userId}/{uuid}.{ext}`.
 *
 * Namespaced by user id so a leaked key cannot be used to guess or
 * overwrite another user's objects, and the extension comes from the
 * declared content type, never from a filename. The key is always built
 * here on the server — it is never accepted from the client.
 *
 * Throws on a type outside the allowlist. The route validates the content
 * type and returns INVALID_FILE_TYPE first, so reaching here with a bad
 * type is a programming error, not user input — this is the backstop.
 */
export function generateObjectKey(userId: string, contentType: string): string {
  if (!isAllowedContentType(contentType)) {
    throw new Error(`Refusing to build an object key for disallowed content type: ${contentType}`);
  }

  const ext = ALLOWED_IMAGE_CONTENT_TYPES[contentType];
  return `uploads/${userId}/${randomUUID()}.${ext}`;
}
