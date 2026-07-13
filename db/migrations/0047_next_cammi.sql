CREATE TABLE "form_custom_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_key" text NOT NULL,
	"list_key" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "form_custom_options_key_label_uidx" ON "form_custom_options" USING btree ("form_key","list_key",lower("label"));--> statement-breakpoint
CREATE INDEX "form_custom_options_lookup_idx" ON "form_custom_options" USING btree ("form_key","list_key","is_active","sort_order");