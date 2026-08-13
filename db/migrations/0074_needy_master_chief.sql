ALTER TABLE "employees" ADD COLUMN "is_approver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Seed the approver. Manan, 2026-08-13: the approval step is Alok's alone, so
-- exactly one row starts with the flag. Everyone else (including the other
-- three admins) is granted it from Admin → People if that ever changes.
-- Idempotent: re-running only re-sets a row that is already true.
UPDATE "employees" SET "is_approver" = true WHERE lower("email") = 'alok@carbideindia.com';
