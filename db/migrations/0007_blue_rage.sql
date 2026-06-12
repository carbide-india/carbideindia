ALTER TABLE "client_contacts" ADD COLUMN "designation" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_meeting_notes" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_sales_person_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "business_card_front_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "business_card_back_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_kyc_sales_person_id_employees_id_fk" FOREIGN KEY ("kyc_sales_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;