"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, masterOptions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { searchMaterials, type MaterialHit, type SearchMaterialsOptions } from "@/lib/queries/item-search";
import { createItem } from "@/app/(app)/items/actions";
import { itemDedupKey } from "@/lib/item-master/dedup";
import type { CreateItemInput } from "@/lib/validators/item";

/**
 * Product Picker server actions (ERP redesign - Phase 9a, §7).
 *
 * Backs the SAP-style Material Search: search-existing-first, create-if-missing.
 * `searchItemsAction` fans out over the where-used search (item-owned columns +
 * live master names + customer set); `createMaterialAction` mints/attaches via
 * the SHARED, unchanged `createItem` path (same dedup/race handling); and
 * `getMaterialSpecForPrefill` returns the product-card-shaped spec so a picked
 * Item pre-fills the enquiry line - letting createInquiry's in-tx item sync
 * dedup back to that exact Item without any change to the create flow.
 */

/** Search materials (autocomplete). Guarded by requireUser like the palette. */
export async function searchItemsAction(
  opts: SearchMaterialsOptions,
): Promise<MaterialHit[]> {
  await requireUser();
  return searchMaterials(opts);
}

/**
 * The enquiry-product-line shape a picked/created Item pre-fills. Shape is a
 * NAME (the product editor selects a shape master NAME); classification masters
 * are ids; dims are strings for the numeric inputs.
 */
export interface MaterialPrefill {
  itemId: string;
  itemCode: string;
  shape: string | null;
  gradeId: string | null;
  toleranceId: string | null;
  conditionId: string | null;
  gradeCustomer: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
}

/**
 * Resolve an Item's canonical spec into the product-line prefill shape. The
 * shape is returned as its master NAME (the enquiry editor keys shapes by name);
 * everything else maps 1:1 onto the product card fields.
 */
export async function getMaterialSpecForPrefill(
  itemId: string,
): Promise<MaterialPrefill | null> {
  await requireUser();
  const [row] = await db
    .select({
      id: items.id,
      itemCode: items.itemCode,
      shapeId: items.shapeId,
      shapeName: masterOptions.name,
      gradeId: items.internalGradeId,
      toleranceId: items.toleranceId,
      conditionId: items.conditionId,
      gradeCustomer: items.gradeCustomer,
      outerDia: items.outerDia,
      innerDia: items.innerDia,
      length: items.length,
      width: items.width,
      thickness: items.thickness,
      dimensionNotes: items.dimensionNotes,
    })
    .from(items)
    .leftJoin(masterOptions, eq(masterOptions.id, items.shapeId))
    .where(eq(items.id, itemId))
    .limit(1);

  if (!row) return null;
  return {
    itemId: row.id,
    itemCode: row.itemCode,
    shape: row.shapeName,
    gradeId: row.gradeId,
    toleranceId: row.toleranceId,
    conditionId: row.conditionId,
    gradeCustomer: row.gradeCustomer,
    outerDia: row.outerDia,
    innerDia: row.innerDia,
    length: row.length,
    width: row.width,
    thickness: row.thickness,
    dimensionNotes: row.dimensionNotes,
  };
}

type CreateResult =
  | { ok: true; prefill: MaterialPrefill; reused: boolean }
  | { ok: false; error: string };

/**
 * Create (or reuse) an Item from the inline mini-form, then return its prefill.
 * Delegates to the SHARED `createItem` (unchanged - same single serial draw,
 * dedup and race handling; it already returns `reused`) so no duplicate can be
 * minted, then reshapes the result into the product-line prefill for auto-select.
 */
export async function createMaterialAction(
  input: CreateItemInput,
): Promise<CreateResult> {
  await requireUser();
  const res = await createItem(input);
  if (!res.ok) return { ok: false, error: res.error };
  const prefill = await getMaterialSpecForPrefill(res.id);
  if (!prefill) return { ok: false, error: "Item saved but could not be loaded." };
  return { ok: true, prefill, reused: res.reused };
}

/**
 * Read-only dedup check for the create mini-form's live panel. Recomputes the
 * fingerprint the same way createItem does and reports whether an identical Item
 * already exists (so the form can offer "Attach existing" instead of minting a
 * duplicate). Never writes.
 */
export interface DedupCheck {
  status: "new" | "exists";
  existing?: { id: string; itemCode: string };
}

export async function checkMaterialDedupAction(input: {
  shapeId?: string;
  internalGradeId?: string;
  conditionId?: string;
  toleranceId?: string;
  outerDia?: number;
  innerDia?: number;
  length?: number;
  width?: number;
  thickness?: number;
}): Promise<DedupCheck> {
  await requireUser();
  const num = (v: number | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const dedupKey = itemDedupKey({
    shapeId: input.shapeId,
    internalGradeId: input.internalGradeId,
    conditionId: input.conditionId,
    toleranceId: input.toleranceId,
    outerDia: num(input.outerDia),
    innerDia: num(input.innerDia),
    length: num(input.length),
    width: num(input.width),
    thickness: num(input.thickness),
  });
  const [existing] = await db
    .select({ id: items.id, itemCode: items.itemCode })
    .from(items)
    .where(eq(items.dedupKey, dedupKey))
    .limit(1);
  return existing
    ? { status: "exists", existing: { id: existing.id, itemCode: existing.itemCode } }
    : { status: "new" };
}

/** Active shape masters (id + name) for the create mini-form's shape select. */
export async function listShapeMastersAction(): Promise<
  Array<{ id: string; name: string }>
> {
  await requireUser();
  return db
    .select({ id: masterOptions.id, name: masterOptions.name })
    .from(masterOptions)
    .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.isActive, true)))
    .orderBy(masterOptions.sortOrder, masterOptions.name);
}
