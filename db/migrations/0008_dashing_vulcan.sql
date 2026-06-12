CREATE TYPE "public"."meeting_purpose" AS ENUM('regular_order', 'new_order', 'payment_follow_up', 'upsell', 'courtesy_meeting', 'customer_complaints', 'enquiry_generation', 'other');--> statement-breakpoint
CREATE SEQUENCE "public"."client_meeting_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "client_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_no" text DEFAULT 'MTG' || nextval('client_meeting_no_seq') NOT NULL,
	"sales_person_id" uuid,
	"client_id" uuid,
	"company_name" text NOT NULL,
	"contact_person_name" text NOT NULL,
	"contact_person_designation" text,
	"meeting_date" timestamp with time zone DEFAULT now() NOT NULL,
	"meeting_time" text,
	"client_type" text,
	"purpose" "meeting_purpose" DEFAULT 'regular_order' NOT NULL,
	"purpose_other" text,
	"meeting_notes" text,
	"next_follow_up_date" timestamp with time zone,
	"selfie_url" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_meetings_meeting_no_unique" UNIQUE("meeting_no")
);
--> statement-breakpoint
ALTER TABLE "client_meetings" ADD CONSTRAINT "client_meetings_sales_person_id_employees_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD CONSTRAINT "client_meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD CONSTRAINT "client_meetings_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_meetings_date_idx" ON "client_meetings" USING btree ("meeting_date");--> statement-breakpoint
CREATE INDEX "client_meetings_sales_idx" ON "client_meetings" USING btree ("sales_person_id");