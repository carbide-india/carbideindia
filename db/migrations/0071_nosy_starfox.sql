CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text DEFAULT '' NOT NULL,
	"exchange_rate_to_inr" numeric DEFAULT '1' NOT NULL,
	"rate_updated_at" timestamp with time zone,
	"is_base" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "data_transfer_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"entity" text NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"file_name" text,
	"file_url" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"requested_by_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_number_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_key" text NOT NULL,
	"label" text NOT NULL,
	"module" text NOT NULL,
	"strategy" text DEFAULT 'fy_series' NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"separator" text DEFAULT '/' NOT NULL,
	"pad_to" integer DEFAULT 4 NOT NULL,
	"include_fy" boolean DEFAULT true NOT NULL,
	"sequence_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_number_formats_series_key_unique" UNIQUE("series_key")
);
--> statement-breakpoint
CREATE TABLE "hsn_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"tax_rate_id" uuid,
	"default_uom" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hsn_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ip_allowlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"cidr" text NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"session_key" text,
	"ip" text,
	"user_agent" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"variables" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"module" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"rate_percent" numeric DEFAULT '0' NOT NULL,
	"cgst_percent" numeric DEFAULT '0' NOT NULL,
	"sgst_percent" numeric DEFAULT '0' NOT NULL,
	"igst_percent" numeric DEFAULT '0' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "ip_allowlist_enforced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "ip_bypass_emails" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "session_max_hours" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "require_admin_reauth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "base_currency_code" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "default_credit_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "default_credit_limit" numeric;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "default_payment_terms" text;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_transfer_jobs" ADD CONSTRAINT "data_transfer_jobs_requested_by_id_employees_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_number_formats" ADD CONSTRAINT "doc_number_formats_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsn_codes" ADD CONSTRAINT "hsn_codes_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsn_codes" ADD CONSTRAINT "hsn_codes_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_allowlist_entries" ADD CONSTRAINT "ip_allowlist_entries_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_allowlist_entries" ADD CONSTRAINT "ip_allowlist_entries_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_revoked_by_id_employees_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_id_employees_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "currencies_active_sort_idx" ON "currencies" USING btree ("is_active","sort_order","code");--> statement-breakpoint
CREATE INDEX "data_transfer_jobs_started_idx" ON "data_transfer_jobs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "data_transfer_jobs_entity_started_idx" ON "data_transfer_jobs" USING btree ("entity","started_at");--> statement-breakpoint
CREATE INDEX "doc_number_formats_module_sort_idx" ON "doc_number_formats" USING btree ("module","sort_order","series_key");--> statement-breakpoint
CREATE INDEX "hsn_codes_active_code_idx" ON "hsn_codes" USING btree ("is_active","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_allowlist_entries_cidr_uidx" ON "ip_allowlist_entries" USING btree ("cidr");--> statement-breakpoint
CREATE INDEX "ip_allowlist_entries_active_idx" ON "ip_allowlist_entries" USING btree ("is_active","label");--> statement-breakpoint
CREATE UNIQUE INDEX "login_sessions_session_key_uidx" ON "login_sessions" USING btree ("session_key");--> statement-breakpoint
CREATE INDEX "login_sessions_employee_last_seen_idx" ON "login_sessions" USING btree ("employee_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "login_sessions_last_seen_idx" ON "login_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_kind_channel_uidx" ON "message_templates" USING btree ("kind","channel");--> statement-breakpoint
CREATE INDEX "message_templates_kind_idx" ON "message_templates" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "permissions_module_sort_idx" ON "permissions" USING btree ("module","sort_order","key");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_uidx" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_label_uidx" ON "tax_rates" USING btree ("label");--> statement-breakpoint
CREATE INDEX "tax_rates_active_sort_idx" ON "tax_rates" USING btree ("is_active","sort_order");