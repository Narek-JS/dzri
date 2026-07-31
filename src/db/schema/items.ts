import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { categories, districts } from './reference';
import { users } from './users';

/**
 * Values are in creation order, not logical lifecycle order: 'pending_review'
 * belongs after 'draft' and 'rejected' after 'active'. Nothing should depend
 * on enum ordinal comparison — sort by an explicit lifecycle order instead.
 *
 * Logical order:
 *   draft → pending_review → active → rejected → reserved → given → expired → removed
 */
export const itemStatus = pgEnum('item_status', [
  'draft',
  'active',
  'reserved',
  'given',
  'expired',
  'removed',
  'pending_review',
  'rejected',
]);

export const itemCondition = pgEnum('item_condition', [
  'working', // fully usable
  'needs_repair', // broken but has value
  'for_parts',
]);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    districtId: integer('district_id')
      .notNull()
      .references(() => districts.id),

    title: text('title').notNull(),
    description: text('description'),
    condition: itemCondition('condition').notNull().default('working'),
    /** "3rd floor, no lift, bring a friend" */
    pickupNotes: text('pickup_notes'),

    status: itemStatus('status').notNull().default('active'),
    reservedFor: uuid('reserved_for').references(() => users.id),
    /** auto-release deadline */
    reservedUntil: timestamp('reserved_until', { withTimezone: true }),
    givenAt: timestamp('given_at', { withTimezone: true }),

    // moderation: an admin approves or rejects each pending item
    /** Required iff status = 'rejected'; enforced by rejection_reason_matches_status. */
    rejectionReason: text('rejection_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),

    viewCount: integer('view_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
  },
  (table) => [
    // the feed query: active items, newest first, filtered by district/category
    index('items_status_created_at_idx')
      .on(table.status, table.createdAt.desc())
      .where(sql`${table.status} = 'active'`),
    index('items_district_id_status_created_at_idx').on(
      table.districtId,
      table.status,
      table.createdAt.desc(),
    ),
    index('items_category_id_status_created_at_idx').on(
      table.categoryId,
      table.status,
      table.createdAt.desc(),
    ),
    index('items_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),

    // for the background job that expires and un-reserves
    index('items_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'active'`),
    index('items_reserved_until_idx')
      .on(table.reservedUntil)
      .where(sql`${table.status} = 'reserved'`),

    // the admin moderation queue: pending items, oldest first
    index('items_pending_review_created_at_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending_review'`),

    check(
      'reserved_needs_user',
      sql`${table.status} <> 'reserved' or ${table.reservedFor} is not null`,
    ),

    // a rejected item carries a reason; a non-rejected item never does
    check(
      'rejection_reason_matches_status',
      sql`(${table.status} = 'rejected' and ${table.rejectionReason} is not null) or (${table.status} <> 'rejected' and ${table.rejectionReason} is null)`,
    ),
  ],
);

export const itemImages = pgTable(
  'item_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** placeholder while loading */
    blurhash: text('blurhash'),
    position: smallint('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('item_images_item_id_position_idx').on(table.itemId, table.position)],
);

export type ItemStatus = (typeof itemStatus.enumValues)[number];
export type ItemCondition = (typeof itemCondition.enumValues)[number];
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemImage = typeof itemImages.$inferSelect;
export type NewItemImage = typeof itemImages.$inferInsert;
