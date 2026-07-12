CREATE TABLE "form_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"form_key" text DEFAULT 'enquiry' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_drafts_owner_form_updated_idx" ON "form_drafts" USING btree ("owner_id","form_key","updated_at");