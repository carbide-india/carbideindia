ALTER TABLE "employees" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_firebase_uid_unique" UNIQUE("firebase_uid");