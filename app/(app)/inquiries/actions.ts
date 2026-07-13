"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, inquiryItemFeasibility, clients, clientContacts, masterOptions, type NewInquiry } from "@/db/schema";
import { productRowsForInquiry, type BuiltProductRow } from "@/lib/inquiries/product-rows";
import { syncProductToItem, type ItemSpec, type DbOrTx } from "@/lib/item-master/sync";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import {
  ENQUIRY_STATUSES,
  type EnquiryStatus,
  INQUIRY_PRIORITIES,
  type InquiryPriority,
  FEASIBILITY_STATUSES,
  type FeasibilityStatus,
} from "@/db/enums";
import {
  CreateInquirySchema,
  UpdateInquirySchema,
  SetEnquiryStatusSchema,
  SaveFeasibilitySchema,
  SaveFeasibilityFullSchema,
  SetFeasibilityStatusSchema,
  type CreateInquiryInput,
  type SaveFeasibilityInput,
} from "@/lib/validators/inquiry";

/**
 * Inquiry server actions (Phase 2 — sales module write path).
 *
 * NOTE on audit logging: there is intentionally none here. `task_events` is
 * FK'd to tasks and `settings_events` is scoped to admin settings — neither
 * fits inquiry (app-data) writes, and inventing a third audit table is a
 * decision deferred to a later phase.
 */

type ActionResult =
  | { ok: true; id?: string; smNumber?: string }
  | { ok: false; error: string };

type UpdateInquiryInput = z.infer<typeof UpdateInquirySchema>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Drops keys whose value is `undefined`. The validators' OptionalText fields
 * fold `""` → `undefined`, so a "filled" form patch can legitimately arrive
 * as `{ field: undefined }` — which passes the nonempty refine but must not
 * reach `.set()` (and an all-undefined patch must not reach the db at all).
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** `enquiryDate` is a free string in the validator — guard before `new Date`. */
function isParseableDate(s: string): boolean {
  return !Number.isNaN(new Date(s).getTime());
}

/** Parse a numeric string column (null/"" → null). */
function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve an inquiry_items.shape TEXT value (e.g. "Cylinder - Reg") to a
 * master_options uuid of kind 'shape'. Returns null when unmatched (a shapeless
 * spec → draft Item, per the contract). Tx-aware.
 */
async function resolveShapeId(tx: DbOrTx, shapeText: string | null | undefined): Promise<string | null> {
  if (!shapeText) return null;
  const [shapeRow] = await tx
    .select({ id: masterOptions.id })
    .from(masterOptions)
    .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.name, shapeText)))
    .limit(1);
  return shapeRow?.id ?? null;
}

/**
 * Build the SSOT-clean ItemSpec from a built inquiry_items product row (shape
 * TEXT + string dims). No customer/qty/sm fields — those never reach `items`.
 */
async function specFromLine(tx: DbOrTx, r: BuiltProductRow): Promise<ItemSpec> {
  return {
    shapeId: await resolveShapeId(tx, r.shape),
    internalGradeId: r.gradeId,
    toleranceId: r.toleranceId,
    conditionId: r.conditionId,
    gradeCustomer: r.gradeCustomer,
    outerDia: toNum(r.outerDia), innerDia: toNum(r.innerDia),
    length: toNum(r.length), width: toNum(r.width), thickness: toNum(r.thickness),
    dimensionNotes: r.dimensionNotes,
  };
}

export async function createInquiry(
  input: CreateInquiryInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateInquirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  if (v.enquiryDate && !isParseableDate(v.enquiryDate)) {
    return { ok: false, error: "Invalid enquiry date" };
  }

  try {
    const created = await db.transaction(async (tx) => {
      let clientId = v.clientId ?? null;

      if (v.clientMode === "new") {
        // Upsert-by-name: an existing client with this name is reused, not duplicated.
        const [existing] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(sql`lower(${clients.name}) = ${v.companyName.toLowerCase()}`)
          .limit(1);
        if (existing) {
          clientId = existing.id;
        } else {
          const [c] = await tx
            .insert(clients)
            .values({
              name: v.companyName,
              export: v.export,
              currency: v.currency,
              country: v.country,
              state: v.state,
              city: v.city,
              addressLine1: v.addressLine1,
              addressLine2: v.addressLine2,
              addressLine3: v.addressLine3,
              addressLine4: v.addressLine4,
              pinCode: v.pinCode,
            })
            .returning({ id: clients.id });
          if (!c) throw new Error("clients insert returned no row");
          clientId = c.id;
          if (v.contactFirstName) {
            await tx.insert(clientContacts).values({
              clientId,
              firstName: v.contactFirstName,
              lastName: v.contactLastName,
              contactNo: v.contactNo,
              email: v.contactEmail,
              ccEmails: v.ccEmails,
            });
          }
        }
      }

      const productRows = productRowsForInquiry(v);
      const p0 = productRows[0];

      const [row] = await tx
        .insert(inquiries)
        .values({
          clientId,
          enquiryDate: v.enquiryDate ? new Date(v.enquiryDate) : undefined,
          priority: v.priority,
          source: v.source,
          companyName: v.companyName,
          export: v.export,
          currency: v.currency,
          country: v.country,
          state: v.state,
          city: v.city,
          addressLine1: v.addressLine1,
          addressLine2: v.addressLine2,
          addressLine3: v.addressLine3,
          addressLine4: v.addressLine4,
          pinCode: v.pinCode,
          contactFirstName: v.contactFirstName,
          contactLastName: v.contactLastName,
          contactNo: v.contactNo,
          contactEmail: v.contactEmail,
          ccEmails: v.ccEmails,
          extraContacts: v.extraContacts,
          productDescription: v.productDescription,
          quantityStatus: v.quantityStatus,
          quantityNos: p0?.quantityNos ?? undefined,
          quantityUom: p0?.quantityUom ?? v.quantityUom,
          docsGiven: v.docsGiven,
          shapeDimensionCheck: v.shapeDimensionCheck,
          gradeCheck: v.gradeCheck,
          toleranceCheck: v.toleranceCheck,
          conditionCheck: v.conditionCheck,
          sampleReceived: v.sampleReceived,
          assumedValues: v.assumedValues,
          shape: p0?.shape ?? undefined,
          outerDia: p0?.outerDia ?? undefined,
          innerDia: p0?.innerDia ?? undefined,
          length: p0?.length ?? undefined,
          width: p0?.width ?? undefined,
          thickness: p0?.thickness ?? undefined,
          dimensionNotes: p0?.dimensionNotes ?? undefined,
          gradeId: p0?.gradeId ?? undefined,
          toleranceId: p0?.toleranceId ?? undefined,
          conditionId: p0?.conditionId ?? undefined,
          smFolderLink: v.smFolderLink,
          enquiryNotes: v.enquiryNotes,
          assignedSalesPersonId: v.assignedSalesPersonId,
          departmentId: v.departmentId,
          createdById: me.id,
        })
        .returning({ id: inquiries.id, smNumber: inquiries.smNumber });
      if (!row) throw new Error("inquiries insert returned no row");

      if (productRows.length) {
        // Insert lines one at a time so we can run the Item-Sync Contract for
        // each INSIDE this transaction (§3.5): every committed product line
        // already carries an item_id (a reused/created Item, possibly a draft).
        // An incomplete spec does NOT roll back — it becomes a draft Item; only
        // a real DB error rolls back (we never commit a product with no Item).
        for (const r of productRows) {
          // Pre-generate the line id so the Item-Sync Contract can run BEFORE the
          // insert — the line is then inserted WITH its item_id in a single
          // statement. This satisfies the `inquiry_items.item_id NOT NULL`
          // invariant (I1): a plain NOT NULL column is checked at insert time and
          // cannot be deferred, so an insert-then-update pattern would fail.
          const lineId = crypto.randomUUID();
          const spec = await specFromLine(tx, r);
          const res = await syncProductToItem(tx, spec, lineId, { id: me.id, name: me.name });
          await tx
            .insert(inquiryItems)
            .values({ id: lineId, inquiryId: row.id, ...r, itemId: res.itemId });
        }
      }

      return { row };
    });

    revalidatePath("/inquiries");
    revalidatePath("/items");

    return { ok: true, id: created.row.id, smNumber: created.row.smNumber };
  } catch (err) {
    console.error("[createInquiry] failed", err);
    return { ok: false, error: "Could not create the inquiry. Please try again." };
  }
}

export async function updateInquiry(
  id: string,
  input: UpdateInquiryInput,
): Promise<ActionResult> {
  // Item-Sync boundary (§3.5): the enquiry edit form does NOT edit products
  // today, so this action only patches the header + legacy single-product
  // columns. As a forward-safe net, after the header write we RE-SYNC each
  // still-present inquiry_items line (re-run syncProductToItem and relink
  // item_id if the fingerprint drifted). We deliberately DO NOT delete/reinsert
  // inquiry_items lines and DO NOT touch costings — a wholesale delete/reinsert
  // would cascade-destroy per-line costings/quote links. If the form never
  // edits products, the re-sync is a harmless no-op (fingerprint unchanged →
  // dedup reuse → same item_id).
  const me = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = UpdateInquirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true }; // everything folded away
  if (v.enquiryDate !== undefined && !isParseableDate(v.enquiryDate)) {
    return { ok: false, error: "Invalid enquiry date" };
  }

  // `clientMode` is form-only (not a column); numeric columns take strings.
  const {
    clientMode: _clientMode,
    enquiryDate,
    quantityNos,
    outerDia,
    innerDia,
    length,
    width,
    thickness,
    ...rest
  } = v;
  const patch: Partial<NewInquiry> = { ...rest };
  if (enquiryDate !== undefined) patch.enquiryDate = new Date(enquiryDate);
  if (quantityNos !== undefined) patch.quantityNos = String(quantityNos);
  if (outerDia !== undefined) patch.outerDia = String(outerDia);
  if (innerDia !== undefined) patch.innerDia = String(innerDia);
  if (length !== undefined) patch.length = String(length);
  if (width !== undefined) patch.width = String(width);
  if (thickness !== undefined) patch.thickness = String(thickness);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(inquiries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(inquiries.id, id));

      // Forward-safe re-sync of EXISTING lines only (no delete/reinsert). Relink
      // item_id when the spec fingerprint drifted; audit on relink. Does not
      // touch costings.
      const lines = await tx
        .select({
          id: inquiryItems.id,
          itemId: inquiryItems.itemId,
          custProductName: inquiryItems.custProductName,
          custDrawingNo: inquiryItems.custDrawingNo,
          drawingRevisionNo: inquiryItems.drawingRevisionNo,
          shape: inquiryItems.shape,
          outerDia: inquiryItems.outerDia, innerDia: inquiryItems.innerDia,
          length: inquiryItems.length, width: inquiryItems.width, thickness: inquiryItems.thickness,
          dimensionNotes: inquiryItems.dimensionNotes,
          gradeId: inquiryItems.gradeId, gradeCustomer: inquiryItems.gradeCustomer,
          toleranceId: inquiryItems.toleranceId, conditionId: inquiryItems.conditionId,
          quantityNos: inquiryItems.quantityNos, quantityUom: inquiryItems.quantityUom,
        })
        .from(inquiryItems)
        .where(eq(inquiryItems.inquiryId, id));

      for (const line of lines) {
        const spec: ItemSpec = {
          shapeId: await resolveShapeId(tx, line.shape),
          internalGradeId: line.gradeId,
          toleranceId: line.toleranceId,
          conditionId: line.conditionId,
          gradeCustomer: line.gradeCustomer,
          outerDia: toNum(line.outerDia), innerDia: toNum(line.innerDia),
          length: toNum(line.length), width: toNum(line.width), thickness: toNum(line.thickness),
          dimensionNotes: line.dimensionNotes,
        };
        const res = await syncProductToItem(tx, spec, line.id, { id: me.id, name: me.name });
        if (res.itemId !== line.itemId) {
          await tx.update(inquiryItems).set({ itemId: res.itemId, updatedAt: new Date() }).where(eq(inquiryItems.id, line.id));
        }
      }
    });
  } catch (err) {
    console.error("[updateInquiry] failed", err);
    return { ok: false, error: "Could not save the inquiry. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
  revalidatePath("/items");
  return { ok: true };
}

export async function setEnquiryStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SetEnquiryStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  try {
    await db
      .update(inquiries)
      .set({ enquiryStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[setEnquiryStatus] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
  return { ok: true };
}

export async function saveFeasibility(
  id: string,
  input: SaveFeasibilityInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SaveFeasibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const patch = stripUndefined(parsed.data);
  if (Object.keys(patch).length === 0) return { ok: true }; // all fields folded to undefined

  try {
    await db
      .update(inquiries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[saveFeasibility] failed", err);
    return { ok: false, error: "Could not save feasibility. Please try again." };
  }
  revalidatePath(`/inquiries/${id}`);
  return { ok: true };
}

/**
 * Save the whole primary-feasibility screen in one transaction: the SM-level
 * fields + status on `inquiries`, and one upserted verdict row per product in
 * `inquiry_item_feasibility`.
 */
export async function saveFeasibilityFull(
  inquiryId: string,
  input: unknown,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(inquiryId)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SaveFeasibilityFullSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid feasibility data." };
  const { sm, status, products } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const smPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (sm.feasPriority !== undefined) smPatch.feasPriority = sm.feasPriority;
      if (sm.feasExport !== undefined) smPatch.feasExport = sm.feasExport;
      if (sm.feasActionsList !== undefined) smPatch.feasActionsList = sm.feasActionsList;
      if (sm.feasibilityCheckedById !== undefined) smPatch.feasibilityCheckedById = sm.feasibilityCheckedById;
      if (status !== undefined) smPatch.feasibilityStatus = status;
      await tx.update(inquiries).set(smPatch).where(eq(inquiries.id, inquiryId));

      const ownItems = await tx
        .select({ id: inquiryItems.id })
        .from(inquiryItems)
        .where(eq(inquiryItems.inquiryId, inquiryId));
      const ownIds = new Set(ownItems.map((r) => r.id));
      for (const p of products) {
        if (!ownIds.has(p.inquiryItemId)) {
          throw new Error(`inquiry_item ${p.inquiryItemId} does not belong to inquiry ${inquiryId}`);
        }
      }

      for (const p of products) {
        const { inquiryItemId, ...rest } = p;
        await tx
          .insert(inquiryItemFeasibility)
          .values({ inquiryItemId, ...rest })
          .onConflictDoUpdate({
            target: inquiryItemFeasibility.inquiryItemId,
            set: { ...rest, updatedAt: new Date() },
          });
      }
    });
  } catch (err) {
    console.error("[saveFeasibilityFull] failed", err);
    return { ok: false, error: "Could not save the feasibility. Please try again." };
  }
  revalidatePath("/inquiries/[id]", "page");
  revalidatePath("/enquiries/register/[id]", "page");
  return { ok: true };
}

export async function setFeasibilityStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SetFeasibilityStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  try {
    await db
      .update(inquiries)
      .set({ feasibilityStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[setFeasibilityStatus] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
  return { ok: true };
}

/**
 * Bulk-set the enquiry status on many inquiries at once (register table's
 * "Set status" bulk action). Validates the status against the enum and the ids
 * are UUID-shaped before a single `inArray` update.
 */
export async function setEnquiryStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid inquiry id." };
  if (!(ENQUIRY_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await db
      .update(inquiries)
      .set({ enquiryStatus: status as EnquiryStatus, updatedAt: new Date() })
      .where(inArray(inquiries.id, ids));
  } catch (err) {
    console.error("[setEnquiryStatusBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath("/enquiries/register");
  return { ok: true };
}

/**
 * Bulk-set the priority on many inquiries at once (register table's "Set
 * priority" bulk action). Mirrors setEnquiryStatusBulk — validates the priority
 * against the enum and the ids are UUID-shaped before a single `inArray` update.
 */
export async function setEnquiryPriorityBulk(
  ids: string[],
  priority: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid inquiry id." };
  if (!(INQUIRY_PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, error: "Invalid priority" };
  }
  try {
    await db
      .update(inquiries)
      .set({ priority: priority as InquiryPriority, updatedAt: new Date() })
      .where(inArray(inquiries.id, ids));
  } catch (err) {
    console.error("[setEnquiryPriorityBulk] failed", err);
    return { ok: false, error: "Could not update the priorities. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath("/enquiries/register");
  return { ok: true };
}

/**
 * Bulk-assign a sales person to many inquiries at once (register table's "Assign
 * sales person" bulk action). Mirrors setEnquiryStatusBulk — validates the
 * employee id is UUID-shaped (along with every inquiry id) before a single
 * `inArray` update.
 */
export async function assignEnquirySalesPersonBulk(
  ids: string[],
  employeeId: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid inquiry id." };
  if (!isUuid(employeeId)) return { ok: false, error: "Invalid employee id." };
  try {
    await db
      .update(inquiries)
      .set({ assignedSalesPersonId: employeeId, updatedAt: new Date() })
      .where(inArray(inquiries.id, ids));
  } catch (err) {
    console.error("[assignEnquirySalesPersonBulk] failed", err);
    return { ok: false, error: "Could not assign the sales person. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath("/enquiries/register");
  return { ok: true };
}

/**
 * Bulk-set the feasibility status on many inquiries at once (register table's
 * "Set feasibility" bulk action). Mirrors setEnquiryStatusBulk — validates the
 * status against the enum and the ids are UUID-shaped before a single `inArray`
 * update.
 */
export async function setFeasibilityStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid inquiry id." };
  if (!(FEASIBILITY_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid feasibility status" };
  }
  try {
    await db
      .update(inquiries)
      .set({ feasibilityStatus: status as FeasibilityStatus, updatedAt: new Date() })
      .where(inArray(inquiries.id, ids));
  } catch (err) {
    console.error("[setFeasibilityStatusBulk] failed", err);
    return { ok: false, error: "Could not update the feasibility statuses. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath("/enquiries/register");
  return { ok: true };
}

/**
 * Archive an enquiry — drops it off the /inquiries register (the list query
 * filters `is_archived = false`) without destroying any data. The detail page
 * still loads an archived SM if visited directly, and it can be unarchived.
 */
export async function archiveInquiry(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  try {
    await db
      .update(inquiries)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[archiveInquiry] failed", err);
    return { ok: false, error: "Could not archive the enquiry. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
  return { ok: true };
}

/** Restore an archived enquiry back onto the register. */
export async function unarchiveInquiry(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  try {
    await db
      .update(inquiries)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[unarchiveInquiry] failed", err);
    return { ok: false, error: "Could not restore the enquiry. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
  return { ok: true };
}

/**
 * Hard-delete an enquiry (admin only). The inquiry_items children cascade-
 * delete via their FK. Intentionally destructive — there is no undo. Use
 * archiveInquiry for the everyday "get it off my list" case.
 */
export async function deleteInquiry(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "Invalid inquiry id." };
  try {
    await db.delete(inquiries).where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[deleteInquiry] failed", err);
    return { ok: false, error: "Could not delete the enquiry. Please try again." };
  }
  revalidatePath("/inquiries");
  return { ok: true };
}

/** Command-palette search (server action — the palette is a client component). */
export async function searchInquiriesAction(query: string) {
  await requireUser();
  const { searchInquiries } = await import("@/lib/queries/inquiries");
  return searchInquiries(query);
}

type GenerateItemResult =
  | { ok: true; itemCode: string; reused: boolean }
  | { ok: false; error: string };

/**
 * Given an inquiry_items row id, resolves all its product-classification fields
 * and delegates to `createItem` (dedup-safe). On success, writes the returned
 * item id back to `inquiry_items.item_id` and revalidates the inquiry detail
 * and items register pages.
 *
 * Shape resolution: inquiry_items.shape is a TEXT enum value (e.g. "Cylinder -
 * Reg"); createItem wants a shapeId (master_options uuid of kind = 'shape').
 * We look it up here so the caller never needs to supply it.
 */
export async function generateItemForInquiryItem(
  inquiryItemId: string,
): Promise<GenerateItemResult> {
  const me = await requireUser();
  if (!isUuid(inquiryItemId)) return { ok: false, error: "Invalid product id." };

  try {
    // Thin wrapper over the shared Item-Sync Contract (§3.5): load the line and
    // run syncProductToItem inside a transaction (reuse/create — never rejects an
    // incomplete spec; it produces a draft), then relink item_id. Keeps the
    // SM-detail "Generate item code" button working through the single writer.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: inquiryItems.id,
          inquiryId: inquiryItems.inquiryId,
          itemId: inquiryItems.itemId,
          shape: inquiryItems.shape,
          gradeId: inquiryItems.gradeId,
          gradeCustomer: inquiryItems.gradeCustomer,
          toleranceId: inquiryItems.toleranceId,
          conditionId: inquiryItems.conditionId,
          outerDia: inquiryItems.outerDia, innerDia: inquiryItems.innerDia,
          length: inquiryItems.length, width: inquiryItems.width, thickness: inquiryItems.thickness,
          dimensionNotes: inquiryItems.dimensionNotes,
        })
        .from(inquiryItems)
        .where(eq(inquiryItems.id, inquiryItemId))
        .limit(1);
      if (!row) return { notFound: true as const };

      const spec: ItemSpec = {
        shapeId: await resolveShapeId(tx, row.shape),
        internalGradeId: row.gradeId,
        toleranceId: row.toleranceId,
        conditionId: row.conditionId,
        gradeCustomer: row.gradeCustomer,
        outerDia: toNum(row.outerDia), innerDia: toNum(row.innerDia),
        length: toNum(row.length), width: toNum(row.width), thickness: toNum(row.thickness),
        dimensionNotes: row.dimensionNotes,
      };
      const sync = await syncProductToItem(tx, spec, row.id, { id: me.id, name: me.name });
      if (sync.itemId !== row.itemId) {
        await tx.update(inquiryItems).set({ itemId: sync.itemId, updatedAt: new Date() }).where(eq(inquiryItems.id, row.id));
      }
      return { inquiryId: row.inquiryId, itemCode: sync.itemCode, reused: sync.reused };
    });

    if ("notFound" in result) return { ok: false, error: "Product not found." };

    revalidatePath(`/inquiries/${result.inquiryId}`);
    revalidatePath("/items");
    return { ok: true, itemCode: result.itemCode, reused: result.reused };
  } catch (err) {
    console.error("[generateItemForInquiryItem] failed", err);
    return { ok: false, error: "Could not generate the item code. Please try again." };
  }
}
