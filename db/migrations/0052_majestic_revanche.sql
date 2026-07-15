ALTER TABLE "samples" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "samples_client_idx" ON "samples" USING btree ("client_id");