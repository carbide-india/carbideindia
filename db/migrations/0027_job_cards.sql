ALTER TYPE "public"."master_kind" ADD VALUE 'dispatch_condition';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'pressing_type';--> statement-breakpoint
CREATE TABLE "job_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_card_no" text NOT NULL,
	"job_card_date" timestamp with time zone,
	"oa_no" text,
	"sales_order_id" uuid,
	"client_id" uuid,
	"customer_name" text,
	"item_id" uuid,
	"product_code" text,
	"product_name" text,
	"dia_size" text,
	"punch_size" text,
	"proposed_size" text,
	"grade_name" text,
	"grade_colour" text,
	"delivery_date" timestamp with time zone,
	"weight" numeric,
	"height_min" numeric,
	"height_max" numeric,
	"order_quantity" numeric,
	"planned_qty_to_press" numeric,
	"dispatch_condition_id" uuid,
	"tolerance_id" uuid,
	"pressing_type_id" uuid,
	"yp_no" text,
	"support_size_top" text,
	"support_size_bottom" text,
	"make_sample_for_sintering" boolean,
	"outsource" boolean,
	"supplier_vendor_name" text,
	"process" text,
	"prev_weight" numeric,
	"prev_pressure" text,
	"prev_grade_name" text,
	"remarks" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "job_card_id" uuid;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_dispatch_condition_id_master_options_id_fk" FOREIGN KEY ("dispatch_condition_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_tolerance_id_master_options_id_fk" FOREIGN KEY ("tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_pressing_type_id_master_options_id_fk" FOREIGN KEY ("pressing_type_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_cards_job_card_no_uidx" ON "job_cards" USING btree (lower("job_card_no"));--> statement-breakpoint
CREATE INDEX "job_cards_client_idx" ON "job_cards" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "job_cards_item_idx" ON "job_cards" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "job_cards_active_idx" ON "job_cards" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_card_id_job_cards_id_fk" FOREIGN KEY ("job_card_id") REFERENCES "public"."job_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_job_card_idx" ON "documents" USING btree ("job_card_id");