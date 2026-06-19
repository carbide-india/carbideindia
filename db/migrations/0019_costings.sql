CREATE TYPE "public"."costing_logic" AS ENUM('previously_made', 'tooling_available', 'tooling_to_be_made', 'no_tooling');--> statement-breakpoint
CREATE TYPE "public"."costing_route" AS ENUM('inhouse', 'bought_out');--> statement-breakpoint
CREATE TABLE "costings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_item_id" uuid NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"costing_type" "costing_route" NOT NULL,
	"costing_logic" "costing_logic",
	"is_chosen" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"qty" numeric,
	"tool_type" text,
	"tool_cost_method" text,
	"tool_flat_cost" numeric,
	"block_wt" numeric,
	"theoretical_wt" numeric,
	"pressing_wt" numeric,
	"weight_used" text,
	"loss_pct" numeric,
	"rm_price_per_kg" numeric,
	"va_pct" numeric,
	"va_floor_per_kg" numeric,
	"shaping_rate_per_min" numeric,
	"shaping_mins" numeric,
	"machining_type" text,
	"machining_rate" numeric,
	"overhead_pct" numeric,
	"negotiation_pct" numeric,
	"outsourced_vendor_cost" numeric,
	"vendor_oh_pct" numeric,
	"vendor_notes" text,
	"development_cost" numeric,
	"development_notes" text,
	"technical_notes" text,
	"loss_wt" numeric,
	"rm_per_gm" numeric,
	"va_per_gm" numeric,
	"sintered_cost_per_gm" numeric,
	"sintered_price_per_piece" numeric,
	"shaping_cost_per_piece" numeric,
	"machining_cost_per_piece" numeric,
	"cost_after_machining" numeric,
	"negotiation_amount" numeric,
	"final_cost_per_piece" numeric,
	"quote_value" numeric,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"costing_done_status" "costing_done_status" DEFAULT 'not_done' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costings_inquiry_idx" ON "costings" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "costings_item_idx" ON "costings" USING btree ("inquiry_item_id","sort_order");