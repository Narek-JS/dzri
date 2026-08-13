CREATE TYPE "public"."claim_rejected_reason" AS ENUM('declined', 'lost_to_other_claimant', 'item_removed');--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "rejected_reason" "claim_rejected_reason";--> statement-breakpoint
-- Backfill for rows written before this column existed: the old code never
-- recorded which of the three routes a rejection took, so there is nothing
-- to recover it from. 'declined' is the safest default to assert about a
-- row we cannot ask — it is the only one of the three that is true from the
-- claimant's side alone, independent of anything the item or the other
-- claims went on to do. Without this, the constraint below fails to attach
-- on any branch that already has a rejected claim, which a fresh Neon
-- branch never does.
UPDATE "claims" SET "rejected_reason" = 'declined' WHERE "status" = 'rejected' AND "rejected_reason" IS NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claim_rejected_reason_matches_status" CHECK (("claims"."status" = 'rejected' and "claims"."rejected_reason" is not null) or ("claims"."status" <> 'rejected' and "claims"."rejected_reason" is null));