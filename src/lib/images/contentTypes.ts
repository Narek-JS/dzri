/**
 * The image formats a client may upload, and the extension each one is stored
 * under.
 *
 * Deliberately narrow: these are the three formats the client-side compressor
 * emits, and a short allowlist is what lets the file extension be derived from
 * the declared content type instead of trusted from a client-supplied filename.
 *
 * This lives here, not in `src/lib/r2/`, so both sides can share one list. The
 * R2 modules pull in `node:crypto` and the S3 SDK and can never be bundled into
 * a browser; the client-side compressor in this directory runs nowhere else.
 * Two copies of an allowlist is two things to forget to update.
 */
export const ALLOWED_IMAGE_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AllowedContentType = keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

export function isAllowedContentType(value: string): value is AllowedContentType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_CONTENT_TYPES, value);
}
