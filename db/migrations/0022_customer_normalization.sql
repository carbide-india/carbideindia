CREATE TYPE "public"."address_type" AS ENUM('registered', 'bill_to', 'ship_to', 'consignee');--> statement-breakpoint
CREATE TYPE "public"."gst_registration_type" AS ENUM('regular', 'composition', 'unregistered', 'sez', 'overseas', 'uin', 'deemed_export');--> statement-breakpoint
CREATE TABLE "client_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"address_type" "address_type" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"label" text,
	"line_1" text,
	"line_2" text,
	"line_3" text,
	"line_4" text,
	"city" text,
	"state" text,
	"country" text,
	"pin_code" text,
	"gstin" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"bank_name" text,
	"account_no" text,
	"ifsc" text,
	"branch" text,
	"account_holder" text,
	"account_type" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "gst_registration_type" "gst_registration_type";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "place_of_supply" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_transporter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_bank_accounts" ADD CONSTRAINT "client_bank_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_addresses_client_idx" ON "client_addresses" USING btree ("client_id","address_type","sort_order");--> statement-breakpoint
CREATE INDEX "client_bank_accounts_client_idx" ON "client_bank_accounts" USING btree ("client_id","sort_order");