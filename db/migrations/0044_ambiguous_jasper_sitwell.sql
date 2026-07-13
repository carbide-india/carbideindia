CREATE TYPE "public"."client_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'department' BEFORE 'size';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "grade" "client_grade";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_department_id_master_options_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_department_id_master_options_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;