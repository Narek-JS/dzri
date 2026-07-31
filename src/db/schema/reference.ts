import { pgTable, serial, smallint, text } from 'drizzle-orm/pg-core';

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

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameHy: text('name_hy').notNull(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  icon: text('icon'),
  position: smallint('position').notNull().default(0),
});

export type District = typeof districts.$inferSelect;
export type NewDistrict = typeof districts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
