import { cookies } from 'next/headers';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_REFRESH_AFTER_SECONDS,
  signSessionToken,
  verifySessionToken,
} from './jwt';

export const SESSION_COOKIE_NAME = 'dzri_session';

/**
 * What a caller gets for an authenticated request. There is no phone
 * field here, and there must never be one — this type is the thing route
 * handlers and server components reach for, so anything on it will end
 * up in a response eventually.
 */
export type Session = {
  userId: string;
  displayName: string;
};

function cookieOptions() {
  return {
    httpOnly: true,
    // Secure everywhere but local dev, which is served over plain http.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Called after a successful OTP verification. */
export async function setSessionCookie(userId: string, displayName: string): Promise<void> {
  const token = await signSessionToken(userId, displayName);
  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, token, cookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 });
}

/**
 * The session for the current request, or null.
 *
 * Cookie-only: no database round trip, so it is cheap enough to call from
 * any server component. That also means it reflects the user as they were
 * when the token was issued — a route that acts on behalf of the user, or
 * that must respect a ban, wants `requireUser` instead.
 *
 * Sliding expiry: a token past `SESSION_REFRESH_AFTER_SECONDS` is
 * re-issued here, so an active user is never logged out at 90 days while
 * an abandoned session still dies on schedule.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const ageSeconds = Math.floor(Date.now() / 1000) - claims.issuedAt;

  if (ageSeconds > SESSION_REFRESH_AFTER_SECONDS) {
    try {
      const refreshed = await signSessionToken(claims.userId, claims.displayName);
      store.set(SESSION_COOKIE_NAME, refreshed, cookieOptions());
    } catch {
      // Cookies are read-only when rendering a server component. The
      // session is still valid; it just gets extended on the next route
      // handler or server action instead.
    }
  }

  return { userId: claims.userId, displayName: claims.displayName };
}

/**
 * The user's own profile. Never includes `phone` — columns are listed
 * explicitly so a future column cannot leak in by growing the table.
 */
export type SessionUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  districtId: number | null;
  createdAt: Date;
  lastSeenAt: Date | null;
};

/**
 * Resolves the session against the database. Returns null if the session
 * is absent or invalid, if the row is gone, or if the user has been
 * banned since the token was issued — a 90-day cookie must not outlive a
 * ban.
 */
export async function requireUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      districtId: users.districtId,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.isBanned) return null;

  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    districtId: user.districtId,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}

/**
 * `isAdmin` and `avatarUrl` together, for the header — cheaper than
 * `requireAdmin()` (which throws away `avatarUrl` for every non-admin, the
 * majority of signed-in visitors) plus a second query just for the photo.
 * Not an authorization gate like `requireUser`/`requireAdmin`: it never
 * returns null, since a missing or banned row just means "no admin nav
 * link, no photo," not "reject the request." `isAdmin` is still read
 * fresh from the database and still false for a banned row, matching
 * `requireAdmin`'s gate.
 */
export async function getSessionProfile(
  userId: string,
): Promise<{ isAdmin: boolean; avatarUrl: string | null }> {
  const [user] = await db
    .select({ avatarUrl: users.avatarUrl, isAdmin: users.isAdmin, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { isAdmin: false, avatarUrl: null };

  return { isAdmin: user.isAdmin && !user.isBanned, avatarUrl: user.avatarUrl };
}

/**
 * Like `requireUser`, but also requires `is_admin`. Returns null for an
 * absent or invalid session, a banned or missing user, *and* for any
 * authenticated non-admin.
 *
 * A route handler turns that single null into a 404 — never a 403. The
 * admin surface must not be discoverable by a logged-in stranger probing
 * paths: a 403 confirms the endpoint exists, a 404 says nothing. The flag
 * is read from the database, not the cookie, so revoking `is_admin` takes
 * effect immediately and a stale 90-day token cannot carry it.
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      districtId: users.districtId,
      isBanned: users.isBanned,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.isBanned || !user.isAdmin) return null;

  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    districtId: user.districtId,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}
