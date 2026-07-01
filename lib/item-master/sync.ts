import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, masterOptions, inquiryItems, quotationItems, negotiationItems, salesOrderItems, jobCards, documents, costings } from "@/db/schema";
import { itemDedupKey } from "@/lib/item-master/dedup";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";
import { resolveShapeConfig, requiredDims, DIM_FIELDS, type DimField } from "@/lib/masters/shape-config";
import { recordAudit } from "@/lib/audit/record";
import type { ItemStatus } from "@/db/enums";

/**
 * Guaranteed Item-Sync Contract (ERP redesign — Phase 4, §3.3–3.7).
 *
 * This module is the SINGLE contract writer that turns a product spec into an
 * Item row, inside the caller's transaction, with the three invariants:
 *
 *   I1 — Totality:   every product line ends with a non-null item_id.
 *   I2 — Fingerprint: one fingerprint ⇒ exactly one Item, forever (dedup UNIQUE
 *                     + onConflictDoNothing + re-select under a row-lock).
 *   I3 — Nothing hidden: an incomplete spec still yields a visible, searchable
 *                        Item in status='draft' (provenance-salted dedup key).
 *
 * It writes SPEC columns only (shape/grade/tolerance/condition/dims/hsn/uom) —
 * NEVER customer/qty/sm snapshot columns (those belong on inquiry_items).
 */

/** The transaction handle drizzle hands to a `db.transaction` callback. */
export type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Either the live db or a transaction — both expose select/insert/update/execute. */
export type DbOrTx = typeof db | DrizzleTx;

/**
 * The product spec — the SSOT-clean subset that describes a physical item.
 * Deliberately excludes customerName / smNumber / qty / inquiryId (customer-
 * scoped data never lands on `items`). `shapeId` is the resolved shape master
 * uuid (callers holding legacy shape TEXT must resolve it first — see the
 * backfill's normalizeShapeName path).
 */
export interface ItemSpec {
  shapeId?: string | null;
  internalGradeId?: string | null;
  toleranceId?: string | null;
  conditionId?: string | null;
  gradeCustomer?: string | null;
  gradeNameForCust?: string | null;
  outerDia?: number | null;
  innerDia?: number | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  dimensionNotes?: string | null;
  sizeCode?: string | null;
  hsnCode?: string | null;
  uom?: string | null;
  altUom?: string | null;
  altUomConversion?: number | null;
  // Part identity / quotation-line fields (spec-ish; carried through create).
  partNo?: string | null;
  partDescription1?: string | null;
  partDescription2?: string | null;
  partDescription3?: string | null;
  partDescription4?: string | null;
  partTag?: string | null;
}

export interface SyncResult {
  itemId: string;
  itemCode: string;
  status: ItemStatus;
  reused: boolean;
  missing: string[];
}

export interface AuditActor {
  id?: string | null;
  name?: string | null;
}

/** Stable synthetic dedup key for a draft — salted by the source line so two
 *  different incomplete products never collapse into one draft (I3). */
export function draftDedupKey(inquiryItemId: string): string {
  return `draft:${inquiryItemId}`;
}

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Which shape-required dimensions are absent from a spec.
 *   - shape entirely missing ⇒ ["shape"] (closes the shapeless-product hole);
 *   - otherwise the required-but-null dimension field names, per the shape config.
 * Uses the resolveShapeConfig + requiredDims helpers so the rule stays single-
 * sourced with the forms. Needs a DB read to fetch the shape's config.
 */
export async function missingRequiredDims(tx: DbOrTx, spec: ItemSpec): Promise<string[]> {
  if (!spec.shapeId) return ["shape"];
  const [shapeRow] = await tx
    .select({ config: masterOptions.config })
    .from(masterOptions)
    .where(eq(masterOptions.id, spec.shapeId))
    .limit(1);
  // Unknown shape id (deleted master) ⇒ treat like a missing shape.
  if (!shapeRow) return ["shape"];
  const cfg = resolveShapeConfig(shapeRow.config);
  const dims: Record<DimField, number | null> = {
    outerDia: num(spec.outerDia), innerDia: num(spec.innerDia),
    length: num(spec.length), width: num(spec.width), thickness: num(spec.thickness),
  };
  return requiredDims(cfg).filter((f) => dims[f] == null);
}

/**
 * Classify a spec into { key, status, missing }: a COMPLETE spec gets the real
 * itemDedupKey + active; an INCOMPLETE spec gets the provenance-salted draft key
 * + draft (§3.3). Needs a DB read (shape config) via missingRequiredDims.
 */
export async function itemDedupKeyFor(
  tx: DbOrTx,
  spec: ItemSpec,
  inquiryItemId: string,
): Promise<{ key: string; status: "active" | "draft"; missing: string[] }> {
  const missing = await missingRequiredDims(tx, spec);
  return missing.length === 0
    ? { key: itemDedupKey(dedupPartsFor(spec)), status: "active", missing }
    : { key: draftDedupKey(inquiryItemId), status: "draft", missing };
}

/** The dedup fingerprint parts drawn from a spec. */
function dedupPartsFor(spec: ItemSpec) {
  return {
    shapeId: spec.shapeId, internalGradeId: spec.internalGradeId,
    conditionId: spec.conditionId, toleranceId: spec.toleranceId,
    outerDia: num(spec.outerDia), innerDia: num(spec.innerDia),
    length: num(spec.length), width: num(spec.width), thickness: num(spec.thickness),
  };
}

/**
 * Resolve the masters' short codes for the item-code segments. grade/shape/
 * condition/tolerance code == its `code` (falls back to `name`). Shared by
 * createItem, syncProductToItem, completeItem and the backfill.
 */
export async function resolvedShortCodes(
  tx: DbOrTx,
  spec: ItemSpec,
): Promise<{ shapeCode: string; gradeCode: string; conditionCode: string; toleranceCode: string }> {
  const refIds = [spec.shapeId, spec.internalGradeId, spec.conditionId, spec.toleranceId]
    .filter((x): x is string => Boolean(x));
  const codeById = new Map<string, string>();
  if (refIds.length) {
    const rows = await tx
      .select({ id: masterOptions.id, name: masterOptions.name, code: masterOptions.code })
      .from(masterOptions)
      .where(inArray(masterOptions.id, refIds));
    for (const r of rows) codeById.set(r.id, r.code ?? r.name ?? "");
  }
  const codeOf = (id?: string | null) => (id ? (codeById.get(id) ?? "") : "");
  return {
    shapeCode: codeOf(spec.shapeId),
    gradeCode: codeOf(spec.internalGradeId),
    conditionCode: codeOf(spec.conditionId),
    toleranceCode: codeOf(spec.toleranceId),
  };
}

const s = (v: number | null | undefined): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : (typeof v === "string" ? v : null);
const strOr = (v: string | null | undefined): string | null => (v == null || v === "" ? null : v);

/**
 * The SPEC-ONLY column payload written to `items`. NO customer/qty/sm columns —
 * those live on inquiry_items (invariant §2.8.2). `sizeCode` is honored when
 * supplied, else derived from the present dimensions.
 */
export function specColumns(spec: ItemSpec): Record<string, unknown> {
  const dimList = DIM_FIELDS
    .map((f) => num(spec[f]))
    .filter((d): d is number => d !== null);
  const sizeCode = strOr(spec.sizeCode) ?? (dimList.length ? deriveSizeCode(dimList) : null);
  return {
    sizeCode,
    shapeId: spec.shapeId ?? null,
    internalGradeId: spec.internalGradeId ?? null,
    toleranceId: spec.toleranceId ?? null,
    conditionId: spec.conditionId ?? null,
    gradeCustomer: strOr(spec.gradeCustomer),
    gradeNameForCust: strOr(spec.gradeNameForCust),
    outerDia: s(spec.outerDia), innerDia: s(spec.innerDia),
    length: s(spec.length), width: s(spec.width), thickness: s(spec.thickness),
    dimensionNotes: strOr(spec.dimensionNotes),
    partNo: strOr(spec.partNo),
    partDescription1: strOr(spec.partDescription1),
    partDescription2: strOr(spec.partDescription2),
    partDescription3: strOr(spec.partDescription3),
    partDescription4: strOr(spec.partDescription4),
    partTag: strOr(spec.partTag),
    hsnCode: strOr(spec.hsnCode),
    uom: strOr(spec.uom) ?? "Nos",
    altUom: strOr(spec.altUom),
    altUomConversion: s(spec.altUomConversion),
  };
}

/** Draw the next item serial (single nextval — seq & code never diverge). */
async function nextItemSeq(tx: DbOrTx): Promise<number> {
  const rows = (await tx.execute(sql`SELECT nextval('item_seq_seq')::int AS seq`)) as unknown as { seq: number }[];
  return Number(rows[0]?.seq ?? 0);
}

/** Build the code for a spec + drawn serial (draft ⇒ DRAFT-<seq>). */
async function codeFor(tx: DbOrTx, spec: ItemSpec, seq: number, status: "active" | "draft"): Promise<string> {
  if (status === "draft") return `DRAFT-${seq}`;
  const codes = await resolvedShortCodes(tx, spec);
  const dimList = DIM_FIELDS.map((f) => num(spec[f])).filter((d): d is number => d !== null);
  const sizeCode = strOr(spec.sizeCode) ?? (dimList.length ? deriveSizeCode(dimList) : "");
  return buildItemCode({
    sizeCode: sizeCode || "X",
    seq,
    shapeCode: codes.shapeCode,
    gradeCode: codes.gradeCode,
    conditionCode: codes.conditionCode,
    toleranceCode: codes.toleranceCode,
    dims: dimList,
  });
}

/**
 * THE CONTRACT (§3.4). Transaction-aware. Classifies the spec (NEVER rejects an
 * incomplete one — it becomes a draft), dedups under a row-lock, and creates the
 * Item with a single serial draw + onConflictDoNothing + race re-select. Returns
 * the item id to link back onto the source line.
 */
export async function syncProductToItem(
  tx: DrizzleTx,
  spec: ItemSpec,
  inquiryItemId: string,
  actor?: AuditActor,
): Promise<SyncResult> {
  // 1. classify (never rejects incomplete)
  const { key, status, missing } = await itemDedupKeyFor(tx, spec, inquiryItemId);

  // 2. dedup with a row-lock to serialize concurrent adds (I2).
  const existing = await tx
    .select({ id: items.id, itemCode: items.itemCode, status: items.status })
    .from(items)
    .where(eq(items.dedupKey, key))
    .for("update")
    .limit(1);
  if (existing[0]) {
    return { itemId: existing[0].id, itemCode: existing[0].itemCode, status: existing[0].status, reused: true, missing };
  }

  // 3. create — single serial draw so seq & item_code never diverge.
  const seq = await nextItemSeq(tx);
  const itemCode = await codeFor(tx, spec, seq, status);
  const [row] = await tx
    .insert(items)
    .values({
      seq, itemCode, dedupKey: key, status,
      draftReason: missing.length ? `missing:${missing.join(",")}` : null,
      completedAt: status === "active" ? new Date() : null,
      ...specColumns(spec),
    })
    .onConflictDoNothing({ target: items.dedupKey })
    .returning({ id: items.id, itemCode: items.itemCode });

  // 4. race loser re-select (I2 under concurrency).
  if (!row) {
    const [won] = await tx
      .select({ id: items.id, itemCode: items.itemCode, status: items.status })
      .from(items)
      .where(eq(items.dedupKey, key))
      .limit(1);
    if (!won) throw new Error("syncProductToItem: dedup race re-select found no winner");
    return { itemId: won.id, itemCode: won.itemCode, status: won.status, reused: true, missing };
  }

  await recordAudit({
    entityType: "item",
    entityId: row.id,
    entityLabel: row.itemCode,
    action: "create",
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    summary: status === "draft" ? `Draft item created (${`missing:${missing.join(",")}`})` : "Item created (synced from product)",
  });
  return { itemId: row.id, itemCode: row.itemCode, status, reused: false, missing };
}

export type CompleteItemResult =
  | { ok: false; missing: string[] }
  | { ok: true; itemId: string; itemCode: string; merged: boolean };

/**
 * Complete a draft Item → active (§3.6). If a filled spec is still incomplete it
 * stays a draft. Otherwise: if an active TWIN with the real fingerprint already
 * exists, repoint every reference from the draft to the twin and archive the
 * draft (merge, never hard-delete). Else promote the draft IN PLACE — same id,
 * real code — so every referencing row instantly points at an active Item.
 */
export async function completeItem(
  tx: DrizzleTx,
  draftItemId: string,
  filledSpec: ItemSpec,
  actor?: AuditActor,
): Promise<CompleteItemResult> {
  const missing = await missingRequiredDims(tx, filledSpec);
  if (missing.length) return { ok: false, missing };

  const realKey = itemDedupKey(dedupPartsFor(filledSpec));

  // Merge into an existing active twin if one carries the real fingerprint.
  const [twin] = await tx
    .select({ id: items.id, itemCode: items.itemCode })
    .from(items)
    .where(and(eq(items.dedupKey, realKey), eq(items.status, "active")))
    .for("update")
    .limit(1);
  if (twin && twin.id !== draftItemId) {
    await repointItemReferences(tx, draftItemId, twin.id);
    await archiveDraftItem(tx, draftItemId);
    await recordAudit({
      entityType: "item",
      entityId: draftItemId,
      entityLabel: twin.itemCode,
      action: "update",
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      summary: `Draft item merged into active twin ${twin.itemCode}`,
    });
    return { ok: true, itemId: twin.id, itemCode: twin.itemCode, merged: true };
  }

  // Promote in place — same id, fresh serial + real code.
  const seq = await nextItemSeq(tx);
  const itemCode = await codeFor(tx, filledSpec, seq, "active");
  const [row] = await tx
    .update(items)
    .set({
      seq,
      status: "active",
      dedupKey: realKey,
      draftReason: null,
      completedAt: new Date(),
      itemCode,
      ...specColumns(filledSpec),
      updatedAt: new Date(),
    })
    .where(eq(items.id, draftItemId))
    .returning({ id: items.id, itemCode: items.itemCode });
  if (!row) throw new Error("completeItem: draft item not found for promotion");

  await recordAudit({
    entityType: "item",
    entityId: row.id,
    entityLabel: row.itemCode,
    action: "update",
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    summary: "Draft item completed → active (promoted in place)",
  });
  return { ok: true, itemId: row.id, itemCode: row.itemCode, merged: false };
}

/**
 * Fan out an item_id relink across EVERY table that carries item_id TODAY
 * (§3.7). Used when a draft merges into an active twin, so no reference is left
 * dangling (reconciles with the future ON DELETE RESTRICT).
 *
 * Future tables (added in Phase 7) that will need to be added here once they
 * exist: `dispatch_lines`, `invoice_lines`, and the Phase-7 `samples.item_id`.
 */
export async function repointItemReferences(tx: DrizzleTx, fromId: string, toId: string): Promise<void> {
  await tx.update(inquiryItems).set({ itemId: toId, updatedAt: new Date() }).where(eq(inquiryItems.itemId, fromId));
  await tx.update(quotationItems).set({ itemId: toId, updatedAt: new Date() }).where(eq(quotationItems.itemId, fromId));
  await tx.update(negotiationItems).set({ itemId: toId, updatedAt: new Date() }).where(eq(negotiationItems.itemId, fromId));
  await tx.update(salesOrderItems).set({ itemId: toId, updatedAt: new Date() }).where(eq(salesOrderItems.itemId, fromId));
  await tx.update(jobCards).set({ itemId: toId, updatedAt: new Date() }).where(eq(jobCards.itemId, fromId));
  await tx.update(documents).set({ itemId: toId, updatedAt: new Date() }).where(eq(documents.itemId, fromId));
  await tx.update(costings).set({ itemId: toId, updatedAt: new Date() }).where(eq(costings.itemId, fromId));
}

/** Archive a merged-away draft (never hard-delete — preserves the audit trail). */
async function archiveDraftItem(tx: DrizzleTx, itemId: string): Promise<void> {
  await tx
    .update(items)
    .set({ status: "archived", isActive: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(items.id, itemId));
}
