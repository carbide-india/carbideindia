CREATE TYPE "public"."lost_reason" AS ENUM('rate_issue', 'credit_period_issue', 'time_line_issue', 'quality_issue', 'technical_issue', 'others');--> statement-breakpoint
CREATE TABLE "negotiation_remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"status" "negotiation_status" NOT NULL,
	"from_status" "negotiation_status",
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "lost_reason" "lost_reason";--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "lost_reason_remarks" text;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "negotiation_remarks" ADD CONSTRAINT "negotiation_remarks_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_remarks" ADD CONSTRAINT "negotiation_remarks_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negotiation_remarks_thread_idx" ON "negotiation_remarks" USING btree ("negotiation_id","created_at");--> statement-breakpoint
-- Append-only, enforced by the database rather than by the UI.
--
-- Manan's rule is that old remarks cannot be deleted and new ones stack on top.
-- A rule that only lives in the app is one bad server action away from being
-- broken, and the whole point of the thread is that a lost-deal post-mortem can
-- trust it. Same guarantee audit_log has carried since migration 0024.
--
-- The DELETE arm makes one exception, and only one: the cascade from deleting
-- the negotiation itself. Postgres removes the parent row before it applies the
-- referential action, so a vanished parent is a reliable signal that this is a
-- cascade rather than someone reaching in to erase a remark. Without it, the
-- existing delete-negotiation path (app/(app)/negotiations/actions.ts) would
-- fail on any deal that had ever been moved — the trigger would be protecting
-- the thread of a record that no longer exists.
CREATE OR REPLACE FUNCTION negotiation_remarks_block_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM negotiations WHERE id = OLD.negotiation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'negotiation_remarks is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER negotiation_remarks_no_update BEFORE UPDATE ON negotiation_remarks
  FOR EACH ROW EXECUTE FUNCTION negotiation_remarks_block_mutation();
--> statement-breakpoint
CREATE TRIGGER negotiation_remarks_no_delete BEFORE DELETE ON negotiation_remarks
  FOR EACH ROW EXECUTE FUNCTION negotiation_remarks_block_mutation();
