CREATE TABLE IF NOT EXISTS "category_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_hy" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "category_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Only the 4 groups the 4 surviving legacy categories (below) need to
-- reference to satisfy the NOT NULL constraint added further down —
-- not all 11. `npm run db:seed`, run against production right after
-- this migration, inserts the remaining 7 and reconciles the name/
-- position of these 4 by its own onConflictDoUpdate-by-slug (already
-- idempotent), so this does not need to duplicate the rest of
-- src/db/seed.ts's data. `DO NOTHING` on conflict makes this a no-op
-- if these 4 rows already exist — e.g. a re-run of this migration
-- after a prior attempt got this far, or after db:seed already ran.
INSERT INTO "category_groups" ("slug", "name_hy", "name_ru", "name_en", "position") VALUES
	('furniture-decor', 'Կահույք և դեկոր', 'Мебель и декор', 'Furniture & Decor', 0),
	('garden', 'Այգի և բակ', 'Сад и двор', 'Garden & Yard', 5),
	('hobby-sport', 'Գրքեր, հոբբի, սպորտ', 'Книги, хобби и спорт', 'Books, Hobby & Sport', 7),
	('other', 'Այլ', 'Разное', 'Other', 10)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- Of the 10 legacy category rows, 4 slugs are spelled identically in the
-- new 41-category list (furniture, books, plants, other) — seed.ts's
-- onConflictDoUpdate targeting categories.slug updates those rows in
-- place (same id, new name/position/group_id) rather than deleting and
-- reinserting, so they must not be deleted here: production has a live
-- item referencing the legacy 'other' row, and a blanket delete trips
-- items.category_id's FK (DECISIONS.md). Only the 6 legacy slugs with no
-- equivalent in the new list are removed here; deleting them is what
-- lets the NOT NULL column below apply cleanly instead of needing a
-- default. If a live item ever turns up referencing one of these six,
-- this statement fails the same way the original blanket delete did,
-- which is the correct, safe failure — not a case this migration papers
-- over.
DELETE FROM "categories" WHERE "slug" IN ('appliances', 'electronics', 'clothes', 'kids', 'kitchen', 'building_materials');--> statement-breakpoint
-- Nullable first, not NOT NULL directly: a bare `ADD COLUMN ... NOT NULL`
-- with no DEFAULT fails outright against the 4 rows the DELETE above
-- leaves behind (Postgres error 23502, confirmed against production —
-- see the follow-up section on this migration in DECISIONS.md). `IF NOT
-- EXISTS` guards a re-run after this migration got further than this
-- point in an earlier attempt.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "group_id" integer;--> statement-breakpoint
-- Only these 4 slugs can exist in `categories` at this point in the file
-- (the DELETE above already ran), so this fully backfills the table —
-- no row is left null for the NOT NULL statement below to reject. Each
-- is naturally idempotent: re-running just re-sets the same value. Only
-- `group_id` is set — `position`, `name_hy`, etc. are left at their
-- stale 4-old-category-scheme values on purpose, since `npm run db:seed`
-- corrects those right after this migration and there is no reason to
-- duplicate that logic here.
UPDATE "categories" SET "group_id" = (SELECT "id" FROM "category_groups" WHERE "slug" = 'furniture-decor') WHERE "slug" = 'furniture';--> statement-breakpoint
UPDATE "categories" SET "group_id" = (SELECT "id" FROM "category_groups" WHERE "slug" = 'hobby-sport') WHERE "slug" = 'books';--> statement-breakpoint
UPDATE "categories" SET "group_id" = (SELECT "id" FROM "category_groups" WHERE "slug" = 'garden') WHERE "slug" = 'plants';--> statement-breakpoint
UPDATE "categories" SET "group_id" = (SELECT "id" FROM "category_groups" WHERE "slug" = 'other') WHERE "slug" = 'other';--> statement-breakpoint
-- Every row has a value by now, so this succeeds where the original
-- single-statement `ADD COLUMN ... NOT NULL` did not. Setting NOT NULL
-- on a column that is already NOT NULL is a no-op in Postgres, so this
-- is also safe to re-run.
ALTER TABLE "categories" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE no action ON UPDATE no action;