CREATE TABLE "feasibility_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"hint" text,
	"weight" numeric DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_feasibility_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"dimension_key" text NOT NULL,
	"weight_snapshot" numeric DEFAULT '0' NOT NULL,
	"score" integer,
	"risk" "feas_risk",
	"is_critical" boolean DEFAULT false NOT NULL,
	"verdict" "feas_check_verdict",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_feasibility" ADD COLUMN "overall_score" numeric;--> statement-breakpoint
ALTER TABLE "inquiry_feasibility" ADD COLUMN "blocker_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_feasibility_scores" ADD CONSTRAINT "inquiry_feasibility_scores_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feasibility_dimensions_key_uidx" ON "feasibility_dimensions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_feasibility_scores_inq_dim_uidx" ON "inquiry_feasibility_scores" USING btree ("inquiry_id","dimension_key");--> statement-breakpoint
CREATE INDEX "inquiry_feasibility_scores_inquiry_idx" ON "inquiry_feasibility_scores" USING btree ("inquiry_id");