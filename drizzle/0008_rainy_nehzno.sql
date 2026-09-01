ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;