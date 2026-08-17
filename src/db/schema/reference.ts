import { integer, pgTable, serial, smallint, text } from 'drizzle-orm/pg-core';

/**
 * Yerevan administrative districts and the marzes.
 * `region` is 'yerevan' for a city district, otherwise the marz slug.
 */
export const districts = pgTable('districts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameHy: text('name_hy').notNull(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  region: text('region').notNull(),
});

/**
 * The 11 top-level groups categories are organized under (Furniture &
 * Decor, Clothing & Shoes, ...). Unlike `districts.region`, there is no
 * existing row that can double as a group label, so translated group
 * names get their own table — see DECISIONS.md.
 */
export const categoryGroups = pgTable('category_groups', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameHy: text('name_hy').notNull(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  position: smallint('position').notNull().default(0),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameHy: text('name_hy').notNull(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  icon: text('icon'),
  position: smallint('position').notNull().default(0),
  groupId: integer('group_id')
    .notNull()
    .references(() => categoryGroups.id),
});

export type District = typeof districts.$inferSelect;
export type NewDistrict = typeof districts.$inferInsert;
export type CategoryGroup = typeof categoryGroups.$inferSelect;
export type NewCategoryGroup = typeof categoryGroups.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
