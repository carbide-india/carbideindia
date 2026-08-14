-- Prune the form-draft pile-up (2026-08-13).
--
-- Every visit to a new-form page used to mint a FRESH draft id and start
-- autosaving, and a draft could only be reached from the "Unfinished Forms"
-- list. So the store grew a row per abandoned visit and nobody ever resumed
-- one: 57 unfinished quotation forms against 2 actual quotations, 25 unfinished
-- negotiations against 0 negotiations.
--
-- The new-form pages now resume the owner's LATEST draft and carry on with the
-- same id, so from here each person has ONE draft per form, not a trail. This
-- brings the existing data to that shape.
--
-- SOFT-deletes (sets deleted_at) rather than removing rows: the app already has
-- a Recycle Bin with a 48h purge, so anything caught by mistake is recoverable
-- for two days instead of gone. Only rows that are already active are touched,
-- so re-running this is a no-op.

UPDATE "form_drafts" d
SET "deleted_at" = now()
WHERE d."deleted_at" IS NULL
  AND d."id" <> (
    SELECT k."id"
    FROM "form_drafts" k
    WHERE k."owner_id" = d."owner_id"
      AND k."form_key" = d."form_key"
      AND k."deleted_at" IS NULL
    ORDER BY k."updated_at" DESC, k."id" DESC
    LIMIT 1
  );
