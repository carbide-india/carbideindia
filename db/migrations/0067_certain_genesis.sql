ALTER TABLE "inquiry_items" ADD COLUMN "outer_dia_tol" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "inner_dia_tol" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "length_tol" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "width_tol" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "thickness_tol" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_block_wt" numeric;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_net_wt" numeric;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_material_wt" numeric;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_process_route" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_tooling_availability" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_material_availability" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_verdict" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sec_notes" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "secondary_feasibility_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "secondary_feasibility_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "secondary_feasibility_by_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_secondary_feasibility_by_id_employees_id_fk" FOREIGN KEY ("secondary_feasibility_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;