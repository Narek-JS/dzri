import { randomUUID } from 'node:crypto';

/**
 * The only content types a client may upload. Deliberately narrow: these
 * are the three formats the client-side compressor emits, and a short
 * allowlist is what lets the file extension be derived from the declared
 * type instead of trusted from a client-supplied filename.
 *
 * The map value is the extension stored in the object key.
 */
export const ALLOWED_IMAGE_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AllowedContentType = keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

/**
 * 8 MB. Bound into the presigned request so a client cannot upload more
 * than it declared. Egress is this product's main variable cost
 * (CLAUDE.md), so the ceiling is intentionally low.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isAllowedContentType(value: string): value is AllowedContentType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_CONTENT_TYPES, value);
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
