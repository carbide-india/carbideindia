ALTER TABLE "form_drafts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "form_drafts_owner_deleted_idx" ON "form_drafts" USING btree ("owner_id","deleted_at");