CREATE TABLE "stage_remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"record_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stage_remarks" ADD CONSTRAINT "stage_remarks_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_remarks_record_idx" ON "stage_remarks" USING btree ("module","record_id","created_at");