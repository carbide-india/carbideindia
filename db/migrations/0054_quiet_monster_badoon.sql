ALTER TABLE "inquiry_items" ADD COLUMN "quantity_status" "check_state";--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "shape_dimension_check" "check_state";--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "grade_check" "check_state";--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "tolerance_check" "check_state";--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "condition_check" "check_state";--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "assumed_quantity" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "assumed_shape_dimension" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "assumed_grade" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "assumed_tolerance" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "assumed_condition" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "docs_given" text[];--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "sample_received" boolean;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "description" text;