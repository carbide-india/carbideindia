CREATE TYPE "public"."quotation_status" AS ENUM('not_started', 'draft', 'need_info', 'pending_approval', 'quotation_approved');--> statement-breakpoint
CREATE TYPE "public"."sales_order_status" AS ENUM('not_started', 'draft', 'need_info', 'pending_approval', 'sales_order_approved');--> statement-breakpoint
CREATE TYPE "public"."secondary_feasibility_status" AS ENUM('not_started', 'draft', 'need_info', 'pending_approval', 'secondary_feasibility_approved', 'not_feasible');--> statement-breakpoint
ALTER TYPE "public"."costing_done_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."costing_done_status" ADD VALUE 'need_info';--> statement-breakpoint
ALTER TYPE "public"."costing_done_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."costing_done_status" ADD VALUE 'costing_approved';--> statement-breakpoint
ALTER TYPE "public"."enquiry_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."enquiry_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."enquiry_status" ADD VALUE 'enquiry_approved';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."negotiation_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."negotiation_status" ADD VALUE 'need_info';--> statement-breakpoint
ALTER TYPE "public"."negotiation_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."negotiation_status" ADD VALUE 'negotiation_approved';--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "need_info_note" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "revision_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "supersedes_costing_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "is_latest_revision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "revision_reason" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "revised_from_negotiation_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "secondary_feasibility_status" "secondary_feasibility_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "quotation_status" "quotation_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "production_notes" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "sales_order_status" "sales_order_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "production_so_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "production_notes" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "factory_copy_detail" jsonb;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_supersedes_costing_id_costings_id_fk" FOREIGN KEY ("supersedes_costing_id") REFERENCES "public"."costings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_revised_from_negotiation_id_negotiations_id_fk" FOREIGN KEY ("revised_from_negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costings_revision_idx" ON "costings" USING btree ("inquiry_item_id","costing_type","revision_no");--> statement-breakpoint
CREATE INDEX "costings_status_idx" ON "costings" USING btree ("costing_done_status","is_latest_revision");--> statement-breakpoint
CREATE INDEX "documents_vendor_idx" ON "documents" USING btree ("vendor_id");