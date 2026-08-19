ALTER TABLE "items" DROP CONSTRAINT "item_translations_complete_when_active";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "pickup_notes_hy" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "pickup_notes_ru" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "pickup_notes_en" text;--> statement-breakpoint
-- Backfill for rows written before per-locale pickup notes columns existed:
-- the old single-column `pickup_notes` carries no locale of its own, so its
-- value is known to belong to `source_locale` (the column every row has
-- always had filled) and is moved into that locale's new column, exactly as
-- the giver would have produced it through today's CreateItemForm.
UPDATE "items" SET "pickup_notes_hy" = "pickup_notes" WHERE "pickup_notes" is not null AND "source_locale" = 'hy';--> statement-breakpoint
UPDATE "items" SET "pickup_notes_ru" = "pickup_notes" WHERE "pickup_notes" is not null AND "source_locale" = 'ru';--> statement-breakpoint
UPDATE "items" SET "pickup_notes_en" = "pickup_notes" WHERE "pickup_notes" is not null AND "source_locale" = 'en';--> statement-breakpoint
-- An `active` row is about to be bound by `item_translations_complete_when_
-- active`'s new pickup-notes clause below, which — like the title/
-- description clause already there — requires all three locales or none.
-- A `pending_review`/`rejected`/`draft` row is fine holding only
-- `source_locale`'s column (an admin fills the rest during moderation, same
-- as title/description), but an already-`active` row has no such step ahead
-- of it, and there is no real translation to recover for its other two
-- locales — so, same reasoning as 0004_wild_bishop's title/description
-- backfill, the source text is duplicated into whichever of the two are
-- still null rather than leaving the row unable to satisfy a constraint it
-- already, legitimately, satisfies today.
UPDATE "items" SET
  "pickup_notes_hy" = coalesce("pickup_notes_hy", "pickup_notes"),
  "pickup_notes_ru" = coalesce("pickup_notes_ru", "pickup_notes"),
  "pickup_notes_en" = coalesce("pickup_notes_en", "pickup_notes")
WHERE "status" = 'active' AND "pickup_notes" is not null;--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "pickup_notes";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_translations_complete_when_active" CHECK ("items"."status" <> 'active' or (
        "items"."title_hy" is not null and "items"."title_ru" is not null and "items"."title_en" is not null
        and (
          ("items"."description_hy" is null and "items"."description_ru" is null and "items"."description_en" is null)
          or ("items"."description_hy" is not null and "items"."description_ru" is not null and "items"."description_en" is not null)
        )
        and (
          ("items"."pickup_notes_hy" is null and "items"."pickup_notes_ru" is null and "items"."pickup_notes_en" is null)
          or ("items"."pickup_notes_hy" is not null and "items"."pickup_notes_ru" is not null and "items"."pickup_notes_en" is not null)
        )
      ));
