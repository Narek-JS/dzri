import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { otpCodes } from '@/db/schema';

import { getAuthSecret } from './secret';

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;

const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;

/**
 * `randomInt` is a CSPRNG and, unlike `Math.random() * 1e6`, is uniform
 * over the whole range — no digit is more likely than any other.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, '0');
}

/**
 * Only the hash is ever stored (CLAUDE.md). HMAC-SHA256 keyed with
 * JWT_SECRET as the pepper: a stolen database is not enough to check a
 * guess offline, and a 6-digit space is small enough that a plain
 * unsalted digest would be a rainbow table.
 *
 * The phone is bound into the input so a hash captured for one number
 * cannot be replayed against another.
 */
export function hashOtpCode(phone: string, code: string): string {
  return createHmac('sha256', getAuthSecret()).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time — a fast reject leaks how much of the digest matched. */
export function otpHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // timingSafeEqual throws on a length mismatch; hex digests are always
  // the same length, so this only guards against a malformed stored row.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

export type ActiveOtpCode = {
  id: number;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
};

/**
 * Issues a fresh code and invalidates any previous unconsumed one, so a
 * phone has exactly one live code at a time. Returns the plaintext code
 * — the only moment it exists — for handing straight to the SMS provider.
 */
export async function issueOtpCode(phone: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));

  await db.insert(otpCodes).values({ phone, codeHash, expiresAt });

  return { code, expiresAt };
}

/**
 * Newest unconsumed code for the phone, expired or not — the caller
 * distinguishes CODE_EXPIRED from INVALID_CODE, which needs the row.
 */
export async function findActiveOtpCode(phone: string): Promise<ActiveOtpCode | null> {
  const [row] = await db
    .select({
      id: otpCodes.id,
      codeHash: otpCodes.codeHash,
      expiresAt: otpCodes.expiresAt,
      attempts: otpCodes.attempts,
    })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id))
    .limit(1);

  return row ?? null;
}

/**
 * @returns the attempt count after the increment. Incremented in SQL, not
 * read-modify-written, so parallel guesses cannot share one attempt.
 */
export async function recordFailedOtpAttempt(id: number): Promise<number> {
  const [row] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(eq(otpCodes.id, id), isNull(otpCodes.consumedAt)))
    .returning({ attempts: otpCodes.attempts });

  // No row means it was consumed underneath us; treat as exhausted.
  return row?.attempts ?? OTP_MAX_ATTEMPTS;
}

/**
 * @returns false if the code was already consumed. The `is null` guard
 * makes this the atomic step that decides which of two racing verifies
 * of the same code wins.
 */
export async function consumeOtpCode(id: number): Promise<boolean> {
  const [row] = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });

  return row !== undefined;
}
