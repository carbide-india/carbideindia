ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "inquiries_archived_idx" ON "inquiries" ("is_archived");
