CREATE TYPE "public"."master_kind" AS ENUM('customer_type', 'industry_type', 'product_type', 'internal_grade', 'tolerance', 'condition');--> statement-breakpoint
CREATE TABLE "master_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "master_kind" NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "master_options_kind_name_uidx" ON "master_options" USING btree ("kind",lower("name"));--> statement-breakpoint
CREATE INDEX "master_options_kind_active_sort_idx" ON "master_options" USING btree ("kind","is_active","sort_order");