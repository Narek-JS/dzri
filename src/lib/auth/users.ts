import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * The minimum an authenticated flow needs. `phone` is never selected —
 * CLAUDE.md: list columns explicitly, never read a whole user row into
 * something that ends up in a response.
 */
export type AuthUser = {
  id: string;
  displayName: string;
  isBanned: boolean;
};

const authUserColumns = {
  id: users.id,
  displayName: users.displayName,
  isBanned: users.isBanned,
};

export async function findUserByPhone(phone: string): Promise<AuthUser | null> {
  const [user] = await db
    .select(authUserColumns)
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  return user ?? null;
}

/**
 * Find-or-create in one statement.
 *
 * `phone` is unique, so two verifications racing on a brand-new number
 * would otherwise be a duplicate-key crash for whichever lost. On
 * conflict this touches `last_seen_at` only: an existing user's chosen
 * display name is never overwritten by whatever the login form sent.
 */
export async function createOrTouchUser(phone: string, displayName: string): Promise<AuthUser> {
  const now = new Date();

  const [user] = await db
    .insert(users)
    .values({ phone, displayName, lastSeenAt: now })
    .onConflictDoUpdate({ target: users.phone, set: { lastSeenAt: now } })
    .returning(authUserColumns);

  if (!user) {
    throw new Error('User upsert returned no row');
  }

  return user;
}

export async function touchLastSeen(userId: string): Promise<void> {
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}
