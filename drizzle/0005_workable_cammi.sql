CREATE TABLE "category_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_hy" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "category_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- The 10 existing category rows have no group to point at and are being
-- replaced outright by the 41-category reseed (CLAUDE.md's category
-- restructure), not remapped — their slugs are changing too, and a live
-- FK from `items` would have needed a remapping strategy, so this was
-- only done after confirming `items` has zero rows referencing them.
-- Deleting first is what lets the NOT NULL column below apply cleanly
-- instead of needing a default.
DELETE FROM "categories";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "group_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE no action ON UPDATE no action;