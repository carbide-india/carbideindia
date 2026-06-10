CREATE TYPE "public"."approval_status" AS ENUM('approved', 'not_approved', 'cancelled', 'transferred');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('doer', 'initiator', 'both');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('imp_urgent', 'imp_not_urgent', 'not_imp_urgent', 'not_imp_not_urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('dont_know', 'not_started', 'initiated', 'follow_up', 'need_help', 'on_hold', 'need_info', 'follow_up_1', 'follow_up_2', 'follow_up_3', 'done', 'approved', 'not_approved', 'cancelled', 'transferred');--> statement-breakpoint
CREATE SEQUENCE "public"."tasks_task_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "achievements_earned" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"achievement_key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"progress" jsonb
);
--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"kind" text NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "audit_data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"file_path" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"document_title" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"task_id" uuid,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_departments" (
	"employee_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_departments_employee_id_department_id_pk" PRIMARY KEY("employee_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "employee_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "employee_role" NOT NULL,
	"avatar_url" text,
	"department" text,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clerk_user_id" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"last_inbox_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_opt_in" boolean DEFAULT true NOT NULL,
	"bio" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"availability_auto_revert_at" timestamp with time zone,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"working_hours_start" time DEFAULT '10:00' NOT NULL,
	"working_hours_end" time DEFAULT '19:00' NOT NULL,
	"working_days" integer[] DEFAULT '{1,2,3,4,5,6}'::int[] NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"digest_time" time DEFAULT '08:00' NOT NULL,
	"digest_frequency" text DEFAULT 'daily' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"density" text DEFAULT 'cozy' NOT NULL,
	"accent" text DEFAULT '#D32F2F' NOT NULL,
	"ooo_start" date,
	"ooo_end" date,
	"ooo_delegate_id" uuid,
	"manager_id" uuid,
	"mention_escalation" boolean DEFAULT true NOT NULL,
	"google_refresh_token" text,
	"google_email" text,
	"google_connected_at" timestamp with time zone,
	CONSTRAINT "employees_email_unique" UNIQUE("email"),
	CONSTRAINT "employees_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_dispatch_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"event_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"actor_id" uuid,
	"read_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_channels" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT 'Carbide India' NOT NULL,
	"logo_url" text,
	"digest_hour_ist" integer DEFAULT 9 NOT NULL,
	"idle_timeout_minutes" integer DEFAULT 10 NOT NULL,
	"working_days" integer[] DEFAULT array[1,2,3,4,5] NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"allow_self_register" boolean DEFAULT false NOT NULL,
	"notification_matrix" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"board_column_order" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "org_settings_id_check" CHECK ("org_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "pinned_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_node_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_node_id_employee_id_pk" PRIMARY KEY("project_node_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "project_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"description" text,
	"notes" text,
	"target_date" timestamp with time zone,
	"owner_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "settings_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"target_id" text,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_settings" (
	"status" "task_status" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"color_token" text NOT NULL,
	"display_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"doer_id" uuid NOT NULL,
	"initiator_id" uuid NOT NULL,
	"priority" "task_priority" DEFAULT 'not_imp_not_urgent' NOT NULL,
	"status" "task_status" DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"transferred_from_id" uuid,
	"notes" text,
	"subject" text,
	"client" text,
	"google_event_id" text,
	"google_synced_doer_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"approval_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_import_key" text,
	"short_id" text,
	"task_no" integer DEFAULT nextval('tasks_task_no_seq'),
	"tags" text[],
	"approval_status" "approval_status",
	"revised_target_date" timestamp with time zone,
	"first_read_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"recurrence" text,
	"recurrence_rule" text,
	"recurrence_parent_id" uuid,
	"recurrence_occurrence_date" text,
	"project_node_id" uuid
);
--> statement-breakpoint
ALTER TABLE "achievements_earned" ADD CONSTRAINT "achievements_earned_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_data_exports" ADD CONSTRAINT "audit_data_exports_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_employees_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_events" ADD CONSTRAINT "employee_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_events" ADD CONSTRAINT "employee_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_ooo_delegate_id_employees_id_fk" FOREIGN KEY ("ooo_delegate_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_dispatch_log" ADD CONSTRAINT "notification_dispatch_log_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_task_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."task_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_items" ADD CONSTRAINT "pinned_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_node_id_project_nodes_id_fk" FOREIGN KEY ("project_node_id") REFERENCES "public"."project_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_events" ADD CONSTRAINT "settings_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_settings" ADD CONSTRAINT "status_settings_updated_by_id_employees_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_doer_id_employees_id_fk" FOREIGN KEY ("doer_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_initiator_id_employees_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_transferred_from_id_employees_id_fk" FOREIGN KEY ("transferred_from_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approved_by_id_employees_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_node_id_project_nodes_id_fk" FOREIGN KEY ("project_node_id") REFERENCES "public"."project_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_earned_employee_idx" ON "achievements_earned" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_logs_employee_day_kind_uq" ON "attendance_logs" USING btree ("employee_id","log_date","kind");--> statement-breakpoint
CREATE INDEX "attendance_logs_date_idx" ON "attendance_logs" USING btree ("log_date");--> statement-breakpoint
CREATE INDEX "attendance_logs_employee_date_idx" ON "attendance_logs" USING btree ("employee_id","log_date");--> statement-breakpoint
CREATE INDEX "audit_data_exports_employee_idx" ON "audit_data_exports" USING btree ("employee_id","requested_at");--> statement-breakpoint
CREATE INDEX "clients_active_name_idx" ON "clients" USING btree ("is_active","name");--> statement-breakpoint
CREATE INDEX "departments_active_sort_idx" ON "departments" USING btree ("is_active","sort_order","name");--> statement-breakpoint
CREATE INDEX "document_events_doc_created_idx" ON "document_events" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "document_events_actor_created_idx" ON "document_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "document_events_created_idx" ON "document_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_created_idx" ON "documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_task_idx" ON "documents" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "employee_departments_department_idx" ON "employee_departments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "employee_departments_employee_idx" ON "employee_departments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_events_employee_created_idx" ON "employee_events" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "employee_events_actor_created_idx" ON "employee_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "employee_events_created_idx" ON "employee_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_dispatch_log_retry_idx" ON "notification_dispatch_log" USING btree ("next_attempt_at","attempt_count") WHERE status = 'failed';--> statement-breakpoint
CREATE INDEX "notification_dispatch_log_notification_idx" ON "notification_dispatch_log" USING btree ("notification_id","channel","attempted_at");--> statement-breakpoint
CREATE INDEX "notification_preferences_employee_idx" ON "notification_preferences" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_kind_created_idx" ON "notifications" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pinned_items_employee_idx" ON "pinned_items" USING btree ("employee_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_nodes_parent_idx" ON "project_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "project_nodes_kind_idx" ON "project_nodes" USING btree ("kind","is_archived");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settings_events_scope_target_created_idx" ON "settings_events" USING btree ("scope","target_id","created_at");--> statement-breakpoint
CREATE INDEX "settings_events_actor_created_idx" ON "settings_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "settings_events_created_idx" ON "settings_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subjects_active_name_idx" ON "subjects" USING btree ("is_active","name");--> statement-breakpoint
CREATE INDEX "task_events_task_created_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_events_actor_created_idx" ON "task_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "task_events_created_idx" ON "task_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_doer_created_idx" ON "tasks" USING btree ("doer_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_initiator_created_idx" ON "tasks" USING btree ("initiator_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_status_created_idx" ON "tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_pending_created_idx" ON "tasks" USING btree ("created_at") WHERE "tasks"."status" IN ('not_started','initiated','follow_up','need_help','need_info','follow_up_1','follow_up_2','follow_up_3');--> statement-breakpoint
CREATE INDEX "tasks_archived_idx" ON "tasks" USING btree ("archived","created_at");--> statement-breakpoint
CREATE INDEX "tasks_created_by_idx" ON "tasks" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "tasks_approval_status_idx" ON "tasks" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "tasks_due_at_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "tasks_approved_by_idx" ON "tasks" USING btree ("approved_by_id");--> statement-breakpoint
CREATE INDEX "tasks_transferred_from_idx" ON "tasks" USING btree ("transferred_from_id");--> statement-breakpoint
CREATE INDEX "tasks_project_node_idx" ON "tasks" USING btree ("project_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_legacy_import_key_uidx" ON "tasks" USING btree ("legacy_import_key") WHERE "tasks"."legacy_import_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_short_id_uidx" ON "tasks" USING btree ("short_id") WHERE "tasks"."short_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_task_no_uidx" ON "tasks" USING btree ("task_no");