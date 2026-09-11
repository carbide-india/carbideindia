ALTER TABLE "inquiry_items" ADD COLUMN "primary_baseline" jsonb;
--> statement-breakpoint
-- Backfill: existing lines get a Primary baseline = their current core spec, so
-- the Secondary register's Primary→Secondary variance has something to compare
-- against (historical Primary values weren't captured, so this is the best
-- approximation — future lines snapshot at creation). Keys are camelCase to
-- match the SpecSnapshot the variance engine reads.
UPDATE "inquiry_items" SET "primary_baseline" = jsonb_strip_nulls(jsonb_build_object(
  'shape', "shape",
  'outerDia', "outer_dia",
  'innerDia', "inner_dia",
  'length', "length",
  'width', "width",
  'thickness', "thickness",
  'dimensionUnit', "dimension_unit",
  'dimensionNotes', "dimension_notes",
  'gradeCustomer', "grade_customer",
  'gradeCustomerFacingId', "grade_customer_facing_id",
  'gradeInternalProductionId', "grade_internal_production_id",
  'toleranceId', "tolerance_id",
  'conditionId', "condition_id",
  'internalProductionCodeId', "internal_production_code_id",
  'partNoId', "part_no_id",
  'quantityNos', "quantity_nos",
  'quantityUom', "quantity_uom"
)) WHERE "primary_baseline" IS NULL;
