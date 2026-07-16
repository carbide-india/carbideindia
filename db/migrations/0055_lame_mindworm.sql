CREATE TYPE "public"."feas_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
ALTER TYPE "public"."feas_check_verdict" ADD VALUE 'feasible_with_deviation';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'in_review';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'not_feasible';--> statement-breakpoint
CREATE TABLE "inquiry_feasibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"status" "feasibility_status" DEFAULT 'not_started' NOT NULL,
	"overall_verdict" "feas_check_verdict",
	"risk_rating" "feas_risk",
	"export_regulatory_verdict" "feas_check_verdict",
	"export_regulatory_note" text,
	"lead_time_verdict" "feas_check_verdict",
	"lead_time_note" text,
	"assumptions" text,
	"customer_clarifications" text,
	"action_items" text,
	"priority" "feas_priority",
	"export" boolean,
	"engineer_id" uuid,
	"submitted_at" timestamp with time zone,
	"approver_id" uuid,
	"approved_at" timestamp with time zone,
	"approval_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "drawing_completeness_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "tooling_process_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "material_supply_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "surface_finish_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "special_process_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "drawing_completeness_note" text;--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "tooling_process_note" text;--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "material_supply_note" text;--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "surface_finish_note" text;--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "special_process_note" text;--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "item_verdict" "feas_check_verdict";--> statement-breakpoint
ALTER TABLE "inquiry_item_feasibility" ADD COLUMN "item_risk_rating" "feas_risk";--> statement-breakpoint
ALTER TABLE "inquiry_feasibility" ADD CONSTRAINT "inquiry_feasibility_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_feasibility" ADD CONSTRAINT "inquiry_feasibility_engineer_id_employees_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_feasibility" ADD CONSTRAINT "inquiry_feasibility_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_feasibility_inquiry_uidx" ON "inquiry_feasibility" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "inquiry_feasibility_status_idx" ON "inquiry_feasibility" USING btree ("status");