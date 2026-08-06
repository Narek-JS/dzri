import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The sweep's only door. No session, no cookie: the caller is a GitHub
 * Actions runner, not a person, and it presents a bearer token compared
 * against `CRON_SECRET`.
 *
 * A failure here is a 404, never a 401 — the same reasoning as the admin
 * surface (CLAUDE.md). A 401 tells an anonymous prober the endpoint exists and
 * that a token is the thing to guess; a 404 says nothing at all.
 */

/**
 * Constant-time compare over digests rather than the raw strings.
 *
 * `timingSafeEqual` throws on a length mismatch, so comparing the tokens
 * directly would need a length check first — and that check would leak the
 * secret's length to anyone timing or probing it. SHA-256 makes both sides a
 * fixed 32 bytes, so there is nothing to branch on and no early exit.
 */
function digestsMatch(a: string, b: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Whether the request carries the cron bearer token.
 *
 * `CRON_SECRET` is read lazily, never at module scope — a `next build` on a
 * machine without secrets must still succeed. An unset or empty secret
 * refuses every caller: an open sweep endpoint is a stranger's button for
 * expiring other people's listings, so the unsafe failure is to fall open, and
 * this falls shut.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization');
  if (!header) return false;

  // Neither the scheme nor the presence of a header is secret, so rejecting
  // early on those leaks nothing worth having.
  const prefix = 'bearer ';
  if (!header.toLowerCase().startsWith(prefix)) return false;

  return digestsMatch(header.slice(prefix.length), expected);
}
