"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, items, masterOptions } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { CreateItemSchema, type CreateItemInput } from "@/lib/validators/item";
import { itemDedupKey } from "@/lib/item-master/dedup";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";
import { specColumns, resolvedShortCodes, type ItemSpec } from "@/lib/item-master/sync";
import { recordAudit } from "@/lib/audit/record";
import { resolveShapeConfig, requiredDims, DIM_LABELS } from "@/lib/masters/shape-config";

type Result =
  | { ok: true; id: string; itemCode: string; reused: boolean }
  | { ok: false; error: string };

/**
 * Snapshot of the enquiry fields used to pre-fill the new-item form.
 * Returned from a server action so the client never fetches raw DB rows.
 */
export interface InquirySnapshot {
  smNumber: string;
  customerName: string;
  custProductName: string | null;
  custDrawingNo: string | null;
  qty: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  gradeCustomer: string | null;
}

/** Returns the per-product enquiry fields that the item form can auto-fill from. */
export async function getInquiryItemForItem(
  inquiryItemId: string,
): Promise<InquirySnapshot | null> {
  await requireUser();
  const [row] = await db
    .select({
      smNumber: inquiries.smNumber,
      customerName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      qty: inquiryItems.quantityNos,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      gradeCustomer: inquiryItems.gradeCustomer,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);

  if (!row) return null;
  return {
    smNumber: row.smNumber,
    customerName: row.customerName,
    custProductName: row.custProductName,
    custDrawingNo: row.custDrawingNo,
    qty: row.qty,
    outerDia: row.outerDia,
    innerDia: row.innerDia,
    length: row.length,
    width: row.width,
    thickness: row.thickness,
    gradeCustomer: row.gradeCustomer,
  };
}

const numOrNull = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Create (or reuse) an Item. If an identical product already exists (same
 * dedup fingerprint) its existing code is returned — no duplicate, no new
 * serial. Otherwise a serial is drawn, the internal item code is assembled
 * from the masters' short codes + dimensions, and the row is inserted.
 * Admin/sales-floor open (requireUser) like the other create forms.
 */
export async function createItem(input: CreateItemInput): Promise<Result> {
  const me = await requireUser();
  const parsed = CreateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const dims = {
    outerDia: numOrNull(v.outerDia), innerDia: numOrNull(v.innerDia),
    length: numOrNull(v.length), width: numOrNull(v.width), thickness: numOrNull(v.thickness),
  };

  // Enforce the selected shape's required dimensions (forms/masters redesign —
  // the shape master's config is the source of truth; trust it server-side).
  if (v.shapeId) {
    const [shapeRow] = await db
      .select({ config: masterOptions.config })
      .from(masterOptions)
      .where(eq(masterOptions.id, v.shapeId))
      .limit(1);
    if (shapeRow) {
      const cfg = resolveShapeConfig(shapeRow.config);
      const missing = requiredDims(cfg).filter((f) => dims[f] == null);
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Missing required dimension(s) for this shape: ${missing.map((f) => DIM_LABELS[f]).join(", ")}.`,
        };
      }
    }
  }

  const dedupKey = itemDedupKey({
    shapeId: v.shapeId, internalGradeId: v.internalGradeId,
    conditionId: v.conditionId, toleranceId: v.toleranceId, ...dims,
  });

  // Reuse if an identical item already exists.
  const [existing] = await db
    .select({ id: items.id, itemCode: items.itemCode })
    .from(items)
    .where(eq(items.dedupKey, dedupKey))
    .limit(1);
  if (existing) return { ok: true, id: existing.id, itemCode: existing.itemCode, reused: true };

  // The SSOT-clean spec (shape/grade/tolerance/condition/dims/hsn/uom/part).
  const spec: ItemSpec = {
    shapeId: v.shapeId ?? null,
    internalGradeId: v.internalGradeId ?? null,
    toleranceId: v.toleranceId ?? null,
    conditionId: v.conditionId ?? null,
    gradeCustomer: v.gradeCustomer ?? null,
    gradeNameForCust: v.gradeNameForCust ?? null,
    outerDia: dims.outerDia, innerDia: dims.innerDia,
    length: dims.length, width: dims.width, thickness: dims.thickness,
    dimensionNotes: v.dimensionNotes ?? null,
    sizeCode: v.sizeCode ?? null,
    hsnCode: v.hsnCode ?? null,
    uom: v.uom ?? null,
    altUom: v.altUom ?? null,
    altUomConversion: v.altUomConversion ?? null,
    partNo: v.partNo ?? null,
    partDescription1: v.partDescription1 ?? null,
    partDescription2: v.partDescription2 ?? null,
    partDescription3: v.partDescription3 ?? null,
    partDescription4: v.partDescription4 ?? null,
    partTag: v.partTag ?? null,
  };

  // Assemble the item code from shared helpers (single serial draw so seq &
  // code never diverge). resolvedShortCodes reuses the same master-code lookup
  // as the sync contract.
  const codes = await resolvedShortCodes(db, spec);
  const dimList = [dims.outerDia, dims.innerDia, dims.length, dims.width, dims.thickness]
    .filter((d): d is number => d !== null);
  const sizeCode = v.sizeCode || (dimList.length ? deriveSizeCode(dimList) : "");
  const seqRows = (await db.execute(sql`SELECT nextval('item_seq_seq')::int AS seq`)) as unknown as { seq: number }[];
  const seq = Number(seqRows[0]?.seq ?? 0);
  const itemCode = buildItemCode({
    sizeCode: sizeCode || "X",
    seq,
    shapeCode: codes.shapeCode,
    gradeCode: codes.gradeCode,
    conditionCode: codes.conditionCode,
    toleranceCode: codes.toleranceCode,
    dims: dimList,
  });

  try {
    const [row] = await db
      .insert(items)
      .values({
        seq, itemCode, dedupKey,
        status: "active",
        completedAt: new Date(),
        // Manual New-Item form / import still record the customer/qty/sm
        // snapshot on the row (legacy provenance columns, dropped in Phase 6).
        // These are NOT part of the SSOT-clean specColumns payload.
        inquiryId: v.inquiryId ?? null,
        smNumber: v.smNumber ?? null,
        customerName: v.customerName ?? null,
        custProductName: v.custProductName ?? null,
        custDrawingNo: v.custDrawingNo ?? null,
        drawingRevisionNo: v.drawingRevisionNo ?? null,
        qty: v.qty != null ? String(v.qty) : null,
        costingType: v.costingType ?? null,
        createdById: me.id,
        ...specColumns(spec),
      })
      .onConflictDoNothing({ target: items.dedupKey })
      .returning({ id: items.id, itemCode: items.itemCode });

    if (!row) {
      // Lost a race — the identical item now exists; return it.
      const [winner] = await db
        .select({ id: items.id, itemCode: items.itemCode })
        .from(items)
        .where(eq(items.dedupKey, dedupKey))
        .limit(1);
      if (winner) return { ok: true, id: winner.id, itemCode: winner.itemCode, reused: true };
      return { ok: false, error: "Could not save the item. Please try again." };
    }
    await recordAudit({
      entityType: "item",
      entityId: row.id,
      entityLabel: row.itemCode,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      summary: "Item created",
    });
    revalidatePath("/items");
    return { ok: true, id: row.id, itemCode: row.itemCode, reused: false };
  } catch (err) {
    console.error("[createItem] failed", err);
    return { ok: false, error: "Could not save the item. Please try again." };
  }
}

type UpdateResult =
  | { ok: true; id: string; itemCode: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update an existing Item in place. The classification + dimensions can change,
 * so both the dedup fingerprint and the internal item code are recomputed — but
 * the serial (`seq`) is REUSED so the code stays stable in its serial slot. If
 * the new fingerprint collides with a DIFFERENT existing item, the edit is
 * rejected (we never merge two serials). Admin/sales-floor open (requireUser).
 */
export async function updateItem(
  id: string,
  input: CreateItemInput,
): Promise<UpdateResult> {
  const me = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid item id." };

  const parsed = CreateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // Load the existing row (need its seq to keep the serial stable).
  const [current] = await db
    .select({ id: items.id, seq: items.seq })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "Item not found." };

  const dims = {
    outerDia: numOrNull(v.outerDia), innerDia: numOrNull(v.innerDia),
    length: numOrNull(v.length), width: numOrNull(v.width), thickness: numOrNull(v.thickness),
  };

  // Enforce the selected shape's required dimensions (same rule as createItem).
  if (v.shapeId) {
    const [shapeRow] = await db
      .select({ config: masterOptions.config })
      .from(masterOptions)
      .where(eq(masterOptions.id, v.shapeId))
      .limit(1);
    if (shapeRow) {
      const cfg = resolveShapeConfig(shapeRow.config);
      const missing = requiredDims(cfg).filter((f) => dims[f] == null);
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Missing required dimension(s) for this shape: ${missing.map((f) => DIM_LABELS[f]).join(", ")}.`,
        };
      }
    }
  }

  const dedupKey = itemDedupKey({
    shapeId: v.shapeId, internalGradeId: v.internalGradeId,
    conditionId: v.conditionId, toleranceId: v.toleranceId, ...dims,
  });

  // Reject if another item already carries this fingerprint (would duplicate).
  const [clash] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.dedupKey, dedupKey))
    .limit(1);
  if (clash && clash.id !== id) {
    return { ok: false, error: "An identical item already exists." };
  }

  // Resolve the masters' codes (grade code == its name, e.g. CIF06).
  const refIds = [v.shapeId, v.internalGradeId, v.conditionId, v.toleranceId].filter(
    (x): x is string => Boolean(x),
  );
  const codeById = new Map<string, { name: string; code: string | null }>();
  if (refIds.length) {
    const rows = await db
      .select({ id: masterOptions.id, name: masterOptions.name, code: masterOptions.code })
      .from(masterOptions)
      .where(inArray(masterOptions.id, refIds));
    for (const r of rows) codeById.set(r.id, { name: r.name, code: r.code });
  }
  const codeOf = (refId?: string) =>
    refId ? (codeById.get(refId)?.code ?? codeById.get(refId)?.name ?? "") : "";

  const dimList = [dims.outerDia, dims.innerDia, dims.length, dims.width, dims.thickness]
    .filter((d): d is number => d !== null);
  const sizeCode = v.sizeCode || (dimList.length ? deriveSizeCode(dimList) : "");

  // Recompute the code reusing the EXISTING serial (stable slot, fresh spec).
  const itemCode = buildItemCode({
    sizeCode: sizeCode || "X",
    seq: current.seq,
    shapeCode: codeOf(v.shapeId),
    gradeCode: codeOf(v.internalGradeId),
    conditionCode: codeOf(v.conditionId),
    toleranceCode: codeOf(v.toleranceId),
    dims: dimList,
  });

  try {
    await db
      .update(items)
      .set({
        itemCode, dedupKey,
        smNumber: v.smNumber ?? null,
        customerName: v.customerName ?? null,
        custProductName: v.custProductName ?? null,
        custDrawingNo: v.custDrawingNo ?? null,
        drawingRevisionNo: v.drawingRevisionNo ?? null,
        qty: v.qty != null ? String(v.qty) : null,
        sizeCode: sizeCode || null,
        shapeId: v.shapeId ?? null,
        internalGradeId: v.internalGradeId ?? null,
        toleranceId: v.toleranceId ?? null,
        conditionId: v.conditionId ?? null,
        gradeCustomer: v.gradeCustomer ?? null,
        gradeNameForCust: v.gradeNameForCust ?? null,
        outerDia: dims.outerDia != null ? String(dims.outerDia) : null,
        innerDia: dims.innerDia != null ? String(dims.innerDia) : null,
        length: dims.length != null ? String(dims.length) : null,
        width: dims.width != null ? String(dims.width) : null,
        thickness: dims.thickness != null ? String(dims.thickness) : null,
        dimensionNotes: v.dimensionNotes ?? null,
        partNo: v.partNo ?? null,
        partDescription1: v.partDescription1 ?? null,
        partDescription2: v.partDescription2 ?? null,
        partDescription3: v.partDescription3 ?? null,
        partDescription4: v.partDescription4 ?? null,
        partTag: v.partTag ?? null,
        costingType: v.costingType ?? null,
        hsnCode: v.hsnCode ?? null,
        uom: v.uom ?? "Nos",
        altUom: v.altUom ?? null,
        altUomConversion: v.altUomConversion != null ? String(v.altUomConversion) : null,
        updatedAt: new Date(),
      })
      .where(eq(items.id, id));
  } catch (err) {
    console.error("[updateItem] failed", err);
    return { ok: false, error: "Could not save the item. Please try again." };
  }

  await recordAudit({
    entityType: "item",
    entityId: id,
    entityLabel: itemCode,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: "Item updated",
  });
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { ok: true, id, itemCode };
}

type ToggleResult = { ok: true } | { ok: false; error: string };

/**
 * Deactivate an item (ERP Phase 4 governance — deactivate-only). Items are
 * NEVER hard-deleted: an item referenced by inquiries/quotes/orders keeps its
 * row. Admin-only. Sets is_active=false + deleted_at.
 */
export async function deactivateItem(itemId: string): Promise<ToggleResult> {
  const me = await requireAdmin();
  if (!UUID_RE.test(itemId)) return { ok: false, error: "Invalid item id." };

  const [item] = await db
    .select({ id: items.id, itemCode: items.itemCode, isActive: items.isActive })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (!item.isActive) return { ok: true }; // idempotent

  try {
    await db
      .update(items)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(items.id, item.id));
  } catch (err) {
    console.error("[deactivateItem] failed", err);
    return { ok: false, error: "Could not deactivate the item. Please try again." };
  }

  await recordAudit({
    entityType: "item",
    entityId: item.id,
    entityLabel: item.itemCode,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `Item ${item.itemCode} deactivated`,
  });
  revalidatePath("/items");
  revalidatePath(`/items/${item.id}`);
  return { ok: true };
}

/** Reactivate a previously-deactivated item (ERP Phase 4). Admin-only. */
export async function reactivateItem(itemId: string): Promise<ToggleResult> {
  const me = await requireAdmin();
  if (!UUID_RE.test(itemId)) return { ok: false, error: "Invalid item id." };

  const [item] = await db
    .select({ id: items.id, itemCode: items.itemCode, isActive: items.isActive })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.isActive) return { ok: true }; // idempotent

  try {
    await db
      .update(items)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(items.id, item.id));
  } catch (err) {
    console.error("[reactivateItem] failed", err);
    return { ok: false, error: "Could not reactivate the item. Please try again." };
  }

  await recordAudit({
    entityType: "item",
    entityId: item.id,
    entityLabel: item.itemCode,
    action: "restore",
    actorId: me.id,
    actorName: me.name,
    summary: `Item ${item.itemCode} reactivated`,
  });
  revalidatePath("/items");
  revalidatePath(`/items/${item.id}`);
  return { ok: true };
}
