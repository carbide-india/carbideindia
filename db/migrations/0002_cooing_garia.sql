CREATE TYPE "public"."check_state" AS ENUM('given', 'not_given', 'assumed');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('not_started', 'initiated', 'need_info', 'need_help', 'proceed');--> statement-breakpoint
CREATE TYPE "public"."feas_priority" AS ENUM('p1', 'p2', 'p3', 'p5_high_profile');--> statement-breakpoint
CREATE TYPE "public"."feas_verdict" AS ENUM('to_check', 'available', 'not_available');--> statement-breakpoint
CREATE TYPE "public"."feasibility_status" AS ENUM('not_started', 'initiated', 'need_info', 'need_help', 'primary_feasibility_done', 'proceed_to_costing');--> statement-breakpoint
CREATE TYPE "public"."inquiry_priority" AS ENUM('high_profile', 'critical', 'important', 'urgent', 'normal');--> statement-breakpoint
CREATE TYPE "public"."inquiry_source" AS ENUM('whatsapp', 'email', 'sample', 'walk_in', 'exhibition', 'other');--> statement-breakpoint
CREATE TYPE "public"."recheck_state" AS ENUM('not_done', 'yes', 'no');--> statement-breakpoint
CREATE SEQUENCE "public"."inquiries_sm_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 9579 CACHE 1;--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"contact_no" text,
	"email" text,
	"cc_emails" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sm_number" text DEFAULT 'SM' || nextval('inquiries_sm_number_seq') NOT NULL,
	"enquiry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"priority" "inquiry_priority" DEFAULT 'normal' NOT NULL,
	"source" "inquiry_source",
	"client_id" uuid,
	"company_name" text NOT NULL,
	"export" boolean,
	"currency" text DEFAULT 'INR' NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"state" text,
	"city" text,
	"address_line_1" text,
	"address_line_2" text,
	"address_line_3" text,
	"address_line_4" text,
	"pin_code" text,
	"contact_first_name" text,
	"contact_last_name" text,
	"contact_no" text,
	"contact_email" text,
	"cc_emails" text,
	"product_description" text NOT NULL,
	"quantity_status" "check_state",
	"quantity_nos" numeric,
	"quantity_uom" text DEFAULT 'Nos' NOT NULL,
	"docs_given" text[],
	"shape_dimension_check" "check_state",
	"grade_check" "check_state",
	"tolerance_check" "check_state",
	"condition_check" "check_state",
	"sample_received" boolean,
	"shape" text,
	"outer_dia" numeric,
	"inner_dia" numeric,
	"length" numeric,
	"width" numeric,
	"thickness" numeric,
	"dimension_notes" text,
	"grade_id" uuid,
	"tolerance_id" uuid,
	"condition_id" uuid,
	"sm_folder_link" text,
	"enquiry_notes" text,
	"assigned_sales_person_id" uuid,
	"enquiry_status" "enquiry_status" DEFAULT 'not_started' NOT NULL,
	"feas_shape_dimension_verdict" "feas_verdict" DEFAULT 'to_check',
	"feas_grade_verdict" "feas_verdict" DEFAULT 'to_check',
	"feas_tolerance_verdict" "feas_verdict" DEFAULT 'to_check',
	"feas_condition_verdict" "feas_verdict" DEFAULT 'to_check',
	"feas_priority" "feas_priority",
	"feas_export" boolean,
	"feas_size_drawing_check" "recheck_state" DEFAULT 'not_done' NOT NULL,
	"feas_size_drawing_notes" text,
	"feas_tolerance_check" "recheck_state" DEFAULT 'not_done' NOT NULL,
	"feas_tolerance_notes" text,
	"feas_grade_app_check" "recheck_state" DEFAULT 'not_done' NOT NULL,
	"feas_grade_app_notes" text,
	"feas_quantity_check" "recheck_state" DEFAULT 'not_done' NOT NULL,
	"feas_quantity_notes" text,
	"feas_condition_check" "recheck_state" DEFAULT 'not_done' NOT NULL,
	"feas_condition_notes" text,
	"feas_actions_list" text,
	"feasibility_checked_by_id" uuid,
	"feasibility_status" "feasibility_status" DEFAULT 'not_started' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_sm_number_unique" UNIQUE("sm_number")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "customer_type_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "industry_type_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "product_type_ids" uuid[];--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "export" boolean;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address_line_1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address_line_3" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address_line_4" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "pin_code" text;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_grade_id_master_options_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_tolerance_id_master_options_id_fk" FOREIGN KEY ("tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_condition_id_master_options_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_sales_person_id_employees_id_fk" FOREIGN KEY ("assigned_sales_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_feasibility_checked_by_id_employees_id_fk" FOREIGN KEY ("feasibility_checked_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("enquiry_status","enquiry_date");--> statement-breakpoint
CREATE INDEX "inquiries_company_idx" ON "inquiries" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "inquiries_sales_person_idx" ON "inquiries" USING btree ("assigned_sales_person_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_customer_type_id_master_options_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_industry_type_id_master_options_id_fk" FOREIGN KEY ("industry_type_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;