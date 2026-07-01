-- ERP redesign — Phase 2 (Foundation B): where-used graph fan-out indexes.
-- btree indexes on the item_id FK columns the where-used UNION-ALL will query.
-- No data change. Idempotent (IF NOT EXISTS). Applied to Neon by the controller.

CREATE INDEX IF NOT EXISTS "costings_item_id_idx" ON "costings" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inquiry_items_item_idx" ON "inquiry_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "negotiation_items_item_idx" ON "negotiation_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_items_item_idx" ON "quotation_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_item_idx" ON "sales_order_items" USING btree ("item_id");
