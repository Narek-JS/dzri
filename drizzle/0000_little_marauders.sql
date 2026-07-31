CREATE TYPE "public"."item_condition" AS ENUM('working', 'needs_repair', 'for_parts');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'active', 'reserved', 'given', 'expired', 'removed');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'selling_not_giving', 'prohibited_item', 'fake_listing', 'offensive', 'other');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_hy" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"icon" text,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_hy" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"region" text NOT NULL,
	CONSTRAINT "districts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"district_id" integer,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "item_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"width" integer,
	"height" integer,
	"blurhash" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"district_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"condition" "item_condition" DEFAULT 'working' NOT NULL,
	"pickup_notes" text,
	"status" "item_status" DEFAULT 'active' NOT NULL,
	"reserved_for" uuid,
	"reserved_until" timestamp with time zone,
	"given_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	CONSTRAINT "reserved_needs_user" CHECK ("items"."status" <> 'reserved' or "items"."reserved_for" is not null)
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "claims_item_id_user_id_unique" UNIQUE("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid,
	"reported_user" uuid,
	"reporter_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"detail" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_has_target" CHECK ("reports"."item_id" is not null or "reports"."reported_user" is not null)
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_reserved_for_users_id_fk" FOREIGN KEY ("reserved_for") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_users_id_fk" FOREIGN KEY ("reported_user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_phone_created_at_idx" ON "otp_codes" USING btree ("phone","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_images_item_id_position_idx" ON "item_images" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "items_status_created_at_idx" ON "items" USING btree ("status","created_at" DESC NULLS LAST) WHERE "items"."status" = 'active';--> statement-breakpoint
CREATE INDEX "items_district_id_status_created_at_idx" ON "items" USING btree ("district_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_category_id_status_created_at_idx" ON "items" USING btree ("category_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_user_id_created_at_idx" ON "items" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_expires_at_idx" ON "items" USING btree ("expires_at") WHERE "items"."status" = 'active';--> statement-breakpoint
CREATE INDEX "items_reserved_until_idx" ON "items" USING btree ("reserved_until") WHERE "items"."status" = 'reserved';--> statement-breakpoint
CREATE INDEX "claims_item_id_status_created_at_idx" ON "claims" USING btree ("item_id","status","created_at");--> statement-breakpoint
CREATE INDEX "claims_user_id_created_at_idx" ON "claims" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_resolved_at_created_at_idx" ON "reports" USING btree ("resolved_at","created_at") WHERE "reports"."resolved_at" is null;--> statement-breakpoint
CREATE VIEW "public"."user_reliability" AS (select
  u.id,
  u.phone,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'no_show')   as no_shows
from users u
left join claims c on c.user_id = u.id
group by u.id, u.phone);