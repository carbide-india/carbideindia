CREATE TYPE "public"."sample_status" AS ENUM('received', 'to_process', 'in_process', 'need_info', 'need_help', 'on_hold', 'processed');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('not_started', 'in_process', 'need_info', 'need_help', 'on_hold', 'done');--> statement-breakpoint
CREATE TABLE "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sample_date" timestamp with time zone DEFAULT now() NOT NULL,
	"inquiry_id" uuid,
	"sample_no" text NOT NULL,
	"location" text DEFAULT 'AYK Cabin' NOT NULL,
	"responsible_person_id" uuid,
	"photo_urls" text[],
	"sample_notes" text,
	"sample_status" "sample_status" DEFAULT 'received' NOT NULL,
	"dimension_status" "stage_status" DEFAULT 'not_started' NOT NULL,
	"dimension_location" text DEFAULT 'Undecided' NOT NULL,
	"dimension_completed_on" timestamp with time zone,
	"chemical_status" "stage_status" DEFAULT 'not_started' NOT NULL,
	"chemical_location" text DEFAULT 'Undecided' NOT NULL,
	"chemical_completed_on" timestamp with time zone,
	"drawing_status" "stage_status" DEFAULT 'not_started' NOT NULL,
	"drawing_location" text DEFAULT 'Undecided' NOT NULL,
	"drawing_completed_on" timestamp with time zone,
	"costing_status" "stage_status" DEFAULT 'not_started' NOT NULL,
	"costing_completed_on" timestamp with time zone,
	"reports_uploaded" text[],
	"reports_in_sm_folder" boolean DEFAULT false NOT NULL,
	"processed_date" timestamp with time zone,
	"process_notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "samples_sample_no_unique" UNIQUE("sample_no")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_meeting_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_meeting_start" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_meeting_end" text;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_responsible_person_id_employees_id_fk" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "samples_status_idx" ON "samples" USING btree ("sample_status","sample_date");--> statement-breakpoint
CREATE INDEX "samples_inquiry_idx" ON "samples" USING btree ("inquiry_id");