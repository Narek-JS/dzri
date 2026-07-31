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
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  districtId: integer('district_id').references(() => districts.id),
  isBanned: boolean('is_banned').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
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
 * This view carries `phone`. It is for internal/admin use only and must
 * never back a public endpoint.
 */
export const userReliability = pgView('user_reliability', {
  id: uuid('id'),
  phone: text('phone'),
  completed: bigint('completed', { mode: 'number' }),
  noShows: bigint('no_shows', { mode: 'number' }),
}).as(
  sql`select
  u.id,
  u.phone,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'no_show')   as no_shows
from users u
left join claims c on c.user_id = u.id
group by u.id, u.phone`,
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
export type NewOtpCode = typeof otpCodes.$inferInsert;
