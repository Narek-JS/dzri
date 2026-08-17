ALTER TABLE "items" ADD COLUMN "title_hy" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "title_ru" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "title_en" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description_hy" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description_ru" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "needs_translation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "source_locale" text DEFAULT 'hy' NOT NULL;--> statement-breakpoint
-- Backfill for rows written before per-locale columns existed: the old
-- single-column `title`/`description` carried no record of which language it
-- was written in, so there is no real translation to recover for the other
-- two locales. Duplicating the existing text into all three columns (rather
-- than leaving two of them null) is what lets a pre-existing `active` row
-- keep satisfying `item_translations_complete_when_active` below without
-- inventing a translation that was never made — the same reasoning the
-- 2026-08-13 claim_rejected_reason backfill used for its default. Rows
-- backfilled this way are not flagged `needs_translation`: nothing is
-- waiting on an admin, the constraint is already satisfied, and marking them
-- would put them in a queue with no missing locale to fill.
UPDATE "items" SET
  "title_hy" = "title", "title_ru" = "title", "title_en" = "title",
  "description_hy" = "description", "description_ru" = "description", "description_en" = "description";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_translations_complete_when_active" CHECK ("items"."status" <> 'active' or (
        "items"."title_hy" is not null and "items"."title_ru" is not null and "items"."title_en" is not null
        and (
          ("items"."description_hy" is null and "items"."description_ru" is null and "items"."description_en" is null)
          or ("items"."description_hy" is not null and "items"."description_ru" is not null and "items"."description_en" is not null)
        )
      ));
