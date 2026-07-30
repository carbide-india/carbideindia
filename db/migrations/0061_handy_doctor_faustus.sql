CREATE SEQUENCE "public"."vendors_vendor_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "costing_vendor_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"costing_id" uuid NOT NULL,
	"vendor_id" uuid,
	"vendor_name_snapshot" text,
	"unit_price" numeric NOT NULL,
	"lead_time_days" integer,
	"credit_period_days" integer,
	"freight_cost" numeric,
	"vendor_oh_pct" numeric,
	"development_cost" numeric,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_code" text DEFAULT 'VN-' || lpad(nextval('vendors_vendor_code_seq')::text, 4, '0'),
	"name" text NOT NULL,
	"contact_person" text,
	"contact_no" text,
	"email" text,
	"address" text,
	"default_credit_days" integer,
	"payment_terms" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_vendor_code_unique" UNIQUE("vendor_code")
);
--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "recommended_option" "costing_route";--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "recommended_vendor_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "approved_option" "costing_route";--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "chosen_vendor_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "is_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "final_unit_cost" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "approver_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD CONSTRAINT "costing_vendor_quotes_costing_id_costings_id_fk" FOREIGN KEY ("costing_id") REFERENCES "public"."costings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD CONSTRAINT "costing_vendor_quotes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costing_vendor_quotes_costing_idx" ON "costing_vendor_quotes" USING btree ("costing_id","sort_order");--> statement-breakpoint
CREATE INDEX "vendors_active_sort_idx" ON "vendors" USING btree ("is_active","sort_order","name");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_name_lower_uidx" ON "vendors" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_chosen_vendor_quote_id_costing_vendor_quotes_id_fk" FOREIGN KEY ("chosen_vendor_quote_id") REFERENCES "public"."costing_vendor_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;