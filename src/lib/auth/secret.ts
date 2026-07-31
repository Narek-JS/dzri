/**
 * One secret, two jobs: signing session JWTs and peppering OTP hashes.
 *
 * Read lazily and never at module scope — a `next build` on a machine
 * without secrets must still succeed.
 */

/** HS256 with a key shorter than the digest is a real weakening. */
const MIN_SECRET_LENGTH = 32;

let cached: string | undefined;

export function getAuthSecret(): string {
  if (cached !== undefined) return cached;

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  cached = secret;
  return cached;
}
