import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { districts } from './reference';

/**
 * The phone number is the account — there is no email or password.
 *
 * `phone` must never reach an API response. See CLAUDE.md: select
 * columns explicitly, never spread a whole user row into a payload.
 *
 * `phone` is nullable so account deletion (`deleteUser`, src/lib/users/
 * delete.ts) can null it out rather than tombstone it with a placeholder
 * string — see DECISIONS.md, 2026-08-30. `unique()` still holds: Postgres
 * treats every `NULL` as distinct from every other, so any number of
 * deleted rows can carry one with no conflict, and `NULL` can never match
 * a real E.164 string in a `WHERE phone = $1`, which is what keeps a
 * fresh signup at a freed number from ever resolving back to the old row.
 *
 * `deletedAt` is the soft-delete marker. A non-null value means: no
 * sign-in (`requireUser`/`requireAdmin`), no phone, and `displayName` is
 * the empty-string sentinel `resolveDisplayName` (src/lib/displayName.ts)
 * renders as a translated placeholder rather than a name.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  districtId: integer('district_id').references(() => districts.id),
  isBanned: boolean('is_banned').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/** Only the hash is stored. Never the raw code. */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('otp_codes_phone_created_at_idx').on(table.phone, table.createdAt.desc())],
);

/**
 * No-show tracking: a giver marks a claim 'no_show', which is how you
 * identify the users who ruin the platform for everyone else.
 *
 * The view carries no phone. It used to, and the id is all its one caller
 * ever needed — `GET /api/items/[id]/claims` looks reliability up by
 * claimant id and reveals a phone from `users` under a status-guarded CASE
 * instead. A phone column here was one careless `select()` away from being
 * the leak the whole trust model is built to prevent, so it is gone rather
 * than documented as forbidden.
 */
export const userReliability = pgView('user_reliability', {
  id: uuid('id'),
  completed: bigint('completed', { mode: 'number' }),
  noShows: bigint('no_shows', { mode: 'number' }),
}).as(
  sql`select
  u.id,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'no_show')   as no_shows
from users u
left join claims c on c.user_id = u.id
group by u.id`,
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
export type NewOtpCode = typeof otpCodes.$inferInsert;
