import { SignJWT, jwtVerify } from 'jose';

import { getAuthSecret } from './secret';

/** 90 days, sliding — see `getSession`. */
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** A token older than this gets re-issued on the next authenticated request. */
export const SESSION_REFRESH_AFTER_SECONDS = 7 * 24 * 60 * 60;

const ALGORITHM = 'HS256';
const ISSUER = 'dzri';
const AUDIENCE = 'dzri:session';

/**
 * The claims carried in the session cookie.
 *
 * `displayName` is here so rendering a header costs no query. The phone
 * number is deliberately absent and must stay absent — a JWT is signed,
 * not encrypted, and anyone holding the cookie can read its payload.
 */
export type SessionClaims = {
  userId: string;
  displayName: string;
  /** Unix seconds. Drives the sliding refresh. */
  issuedAt: number;
};

function signingKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}

export async function signSessionToken(userId: string, displayName: string): Promise<string> {
  return new SignJWT({ name: displayName })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(signingKey());
}

/**
 * @returns null for anything not currently valid — bad signature, wrong
 * issuer, expired, malformed. Callers treat null as "not signed in";
 * there is no reason to distinguish the failures to an anonymous caller.
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    const { sub, name, iat } = payload;

    if (typeof sub !== 'string' || typeof name !== 'string' || typeof iat !== 'number') {
      return null;
    }

    return { userId: sub, displayName: name, issuedAt: iat };
  } catch {
    return null;
  }
}
