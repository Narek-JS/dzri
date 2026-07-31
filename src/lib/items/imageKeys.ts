/**
 * Does an image key belong to this user?
 *
 * This is the security boundary that stops a caller attaching someone else's
 * photos to their own listing. Presigned keys are minted server-side as
 * `uploads/{userId}/{uuid}.{ext}` (see `src/lib/r2/objectKey.ts`), so a key
 * the caller legitimately owns starts with `uploads/{callerId}/` and has
 * exactly one path segment after it.
 *
 * The single-segment rule is what makes traversal impossible: a key like
 * `uploads/{callerId}/../{otherId}/photo.jpg` still starts with the caller's
 * prefix, but the remainder contains a `/` and is rejected. An absolute path
 * or a URL fails the prefix check outright. Existence in the bucket is a
 * separate concern (`headObject`); this function only decides ownership and
 * shape, and is deliberately free of I/O so it can be reasoned about and
 * unit-tested in isolation.
 */
export function isOwnedImageKey(userId: string, key: string): boolean {
  const prefix = `uploads/${userId}/`;

  if (!key.startsWith(prefix)) return false;

  const remainder = key.slice(prefix.length);

  // Exactly one segment: no empty tail (the folder itself), no nested path,
  // and therefore no `../` escape out of the caller's own prefix.
  if (remainder.length === 0) return false;
  if (remainder.includes('/')) return false;
  if (remainder.includes('..')) return false;

  return true;
}
