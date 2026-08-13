import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
 * Why a claim was rejected. `rejected` is the one status a claimant can reach
 * by three unrelated routes, and the difference matters to them more than the
 * status does: being turned down is not the same news as losing to somebody
 * else, which is not the same news as the listing being taken down.
 *
 * One value per writer of `claims.status = 'rejected'`, and there are exactly
 * three:
 *
 *  - `declined` — `rejectClaim`, the giver turning this person down directly.
 *  - `lost_to_other_claimant` — the cascade inside `approveClaim`, which
 *    rejects every other pending claim on the item.
 *  - `item_removed` — the cascade inside `removeItem`, which rejects every
 *    pending claim when the giver deletes the listing. Nobody was picked.
 *
 * Adding a fourth route to `rejected` means adding a value here: the check
 * constraint below leaves no way to write the status without naming a reason.
 */
export const claimRejectedReason = pgEnum('claim_rejected_reason', [
  'declined',
  'lost_to_other_claimant',
  'item_removed',
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
    /** Required iff status = 'rejected'; enforced by claim_rejected_reason_matches_status. */
    rejectedReason: claimRejectedReason('rejected_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    // one claim per person per item, no spamming
    unique('claims_item_id_user_id_unique').on(table.itemId, table.userId),
    index('claims_item_id_status_created_at_idx').on(table.itemId, table.status, table.createdAt),
    index('claims_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),

    // a rejected claim carries a reason; a claim in any other status never
    // does. Mirrors items.rejection_reason_matches_status, and for the same
    // reason: a status whose meaning lives in a second column is only as
    // trustworthy as the guarantee that the second column is populated. This
    // makes "rejected with no reason" unrepresentable rather than merely
    // unwritten, so any future transition *out* of `rejected` has to clear it.
    check(
      'claim_rejected_reason_matches_status',
      sql`(${table.status} = 'rejected' and ${table.rejectedReason} is not null) or (${table.status} <> 'rejected' and ${table.rejectedReason} is null)`,
    ),
  ],
);

export type ClaimStatus = (typeof claimStatus.enumValues)[number];
export type ClaimRejectedReason = (typeof claimRejectedReason.enumValues)[number];
export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
