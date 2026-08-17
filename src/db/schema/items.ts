import { sql } from 'drizzle-orm';
import {
  boolean,
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

    /**
     * Per-locale title/description, mirroring `districts`/`categories`'
     * `name_hy`/`name_ru`/`name_en` convention. Nullable at the column level —
     * only `sourceLocale`'s column is guaranteed filled at creation; the other
     * two are filled by an admin during moderation when `needsTranslation` is
     * true. `itemTranslationsCompleteWhenActive` below is what forbids an
     * `active` item from having any of the three missing.
     */
    titleHy: text('title_hy'),
    titleRu: text('title_ru'),
    titleEn: text('title_en'),
    descriptionHy: text('description_hy'),
    descriptionRu: text('description_ru'),
    descriptionEn: text('description_en'),
    /** True when the giver asked the admin to translate this into the other two locales. */
    needsTranslation: boolean('needs_translation').notNull().default(false),
    /** Which locale the giver actually typed in. Always filled, unlike the two above. */
    sourceLocale: text('source_locale').notNull().default('hy'),
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

    // An item cannot go live missing a translation. Once `active`, all three
    // titles must be filled, and description is all-three-or-none — the
    // giver's own locale is always the one filled first, so "all or none"
    // and "the other two follow the source" are the same condition in
    // practice (DECISIONS.md).
    check(
      'item_translations_complete_when_active',
      sql`${table.status} <> 'active' or (
        ${table.titleHy} is not null and ${table.titleRu} is not null and ${table.titleEn} is not null
        and (
          (${table.descriptionHy} is null and ${table.descriptionRu} is null and ${table.descriptionEn} is null)
          or (${table.descriptionHy} is not null and ${table.descriptionRu} is not null and ${table.descriptionEn} is not null)
        )
      )`,
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
    /** The full-size upload. Never serve this in a list view (CLAUDE.md). */
    url: text('url').notNull(),
    /**
     * The 400px-longest-edge variant the client uploaded alongside the
     * original. Nullable: rows written before the two-variant pipeline have no
     * variant and are not backfilled, so every read falls back to `url`.
     */
    thumbUrl: text('thumb_url'),
    /** Dimensions of the *original*, for laying out its aspect ratio. */
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
