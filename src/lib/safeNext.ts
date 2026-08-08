/**
 * Validates a `?next=` redirect target for the login page. Only a path
 * that starts with exactly one `/` is accepted — `//evil.com` is
 * schema-relative and browsers resolve it as a protocol-relative URL to a
 * different host, and anything with a scheme (`https://evil.com`) is
 * rejected outright. Everything else falls back to the caller's default
 * (the feed) rather than leaving the redirect target unset.
 */
export function resolveSafeNext(raw: string | null): string | null {
  if (raw === null) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;

  return raw;
}
