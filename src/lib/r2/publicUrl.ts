/**
 * Public read URL for a stored object: `R2_PUBLIC_URL` joined to the key.
 * This is the read path — a bucket domain or a CDN in front of it — while
 * the presigned URL is the write path.
 *
 * Read lazily so a build without secrets still works. A trailing slash on
 * the base is tolerated so a slightly-off env var does not yield a double
 * slash in every image URL.
 */
export function publicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;

  if (!base) {
    throw new Error('R2_PUBLIC_URL is not set');
  }

  return `${base.replace(/\/+$/, '')}/${key}`;
}
