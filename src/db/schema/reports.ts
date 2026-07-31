import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { items } from './items';
import { users } from './users';

export const reportReason = pgEnum('report_reason', [
  'spam',
  'selling_not_giving',
  'prohibited_item',
  'fake_listing',
  'offensive',
  'other',
]);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }),
    reportedUser: uuid('reported_user').references(() => users.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: reportReason('reason').notNull(),
    detail: text('detail'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_resolved_at_created_at_idx')
      .on(table.resolvedAt, table.createdAt)
      .where(sql`${table.resolvedAt} is null`),
    check(
      'report_has_target',
      sql`${table.itemId} is not null or ${table.reportedUser} is not null`,
    ),
  ],
);

export type ReportReason = (typeof reportReason.enumValues)[number];
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
