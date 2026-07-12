CREATE TYPE "public"."feas_check_verdict" AS ENUM('feasible', 'not_feasible', 'need_info');--> statement-breakpoint
CREATE TABLE "inquiry_item_feasibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_item_id" uuid NOT NULL,
	"shape_dim_verdict" "feas_check_verdict",
	"grade_verdict" "feas_check_verdict",
	"tolerance_verdict" "feas_check_verdict",
	"condition_verdict" "feas_check_verdict",
	"quantity_verdict" "feas_check_verdict",
	"shape_dim_note" text,
	"grade_note" text,
	"tolerance_note" text,
	"condition_note" text,
	"quantity_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD CONSTRAINT "inquiry_item_feasibility_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_item_feasibility_item_uidx" ON "inquiry_item_feasibility" USING btree ("inquiry_item_id");