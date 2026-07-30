ALTER TYPE "public"."master_kind" ADD VALUE 'tooling_chart';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'machining_op';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'quantity_tolerance';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'payment_term';--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "finished_size" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "tolerance_size" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "sintered_size" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "green_size" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "shrinkage" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "tooling_chart_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "tool_per_piece_cost" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "weight_method" integer;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "mandril_rate" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "mandril_size" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "machining_ops" jsonb;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "external_machining_vendors" jsonb;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "dev_costs" jsonb;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "quantity_tolerance_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_tooling_chart_id_master_options_id_fk" FOREIGN KEY ("tooling_chart_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_quantity_tolerance_id_master_options_id_fk" FOREIGN KEY ("quantity_tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;