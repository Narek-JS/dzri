import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { items } from './items';
import { users } from './users';

export const claimStatus = pgEnum('claim_status', [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
  'completed',
  'no_show',
]);

/**
 * The core interaction: someone says "I want this", the giver picks one
 * person. Phone numbers are revealed only once status is 'approved'.
 */
export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** "I can come today after 6" */
    message: text('message'),
    status: claimStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    // one claim per person per item, no spamming
    unique('claims_item_id_user_id_unique').on(table.itemId, table.userId),
    index('claims_item_id_status_created_at_idx').on(table.itemId, table.status, table.createdAt),
    index('claims_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
  ],
);

export type ClaimStatus = (typeof claimStatus.enumValues)[number];
export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
