CREATE SEQUENCE "public"."clients_client_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "client_code" text DEFAULT 'CL-' || lpad(nextval('clients_client_code_seq')::text, 4, '0');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "credit_days" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "credit_limit" numeric;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bank_account_no" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bank_branch" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "bank_account_holder" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ship_to_address" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "transporter" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "other_references" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "msme_udyam_no" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_client_code_unique" UNIQUE("client_code");