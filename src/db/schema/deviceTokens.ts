import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const devicePlatform = pgEnum('device_platform', ['ios', 'android']);

/**
 * One row per registered device installation. `token` is unique, not
 * `(userId, token)` — a token is an installation's identity, not a
 * relationship, so it always belongs to whichever user most recently
 * registered it. Re-registering the same token (a re-login on the same
 * device, a different account signing in) reassigns `userId` rather than
 * creating a second row.
 */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: devicePlatform('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('device_tokens_token_unique').on(table.token),
    index('device_tokens_user_id_idx').on(table.userId),
  ],
);

export type DevicePlatform = (typeof devicePlatform.enumValues)[number];
export type DeviceToken = typeof deviceTokens.$inferSelect;
export type NewDeviceToken = typeof deviceTokens.$inferInsert;
