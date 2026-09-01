ALTER TYPE "public"."costing_done_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."costing_done_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."feasibility_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."negotiation_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."quotation_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."quotation_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'not_approved';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."sales_order_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."secondary_feasibility_status" ADD VALUE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."secondary_feasibility_status" ADD VALUE 'cancelled';