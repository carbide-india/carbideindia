ALTER TABLE "inquiry_items" ADD COLUMN "feasibility_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "feasibility_confirmed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "feasibility_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_feasibility_confirmed_by_id_employees_id_fk" FOREIGN KEY ("feasibility_confirmed_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;