"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, clients, clientContacts, masterOptions, type NewInquiry } from "@/db/schema";
import { productRowsForInquiry } from "@/lib/inquiries/product-rows";
import { requireUser } from "@/lib/auth/current";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/db/enums";
import {
  CreateInquirySchema,
  UpdateInquirySchema,
  SetEnquiryStatusSchema,
  SaveFeasibilitySchema,
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
          createdById: me.id,
        })
        .returning({ id: inquiries.id, smNumber: inquiries.smNumber });
      if (!row) throw new Error("inquiries insert returned no row");

      let productIds: string[] = [];
      if (productRows.length) {
        const inserted = await tx
          .insert(inquiryItems)
          .values(productRows.map((r) => ({ inquiryId: row.id, ...r })))
          .returning({ id: inquiryItems.id });
        productIds = inserted.map((r) => r.id);
      }

      return { row, productIds };
    });

    revalidatePath("/inquiries");

    // Auto-register each product in the Item Master (dedup-safe). Best-effort:
    // a product that's fully specified gets its item code immediately; one that's
    // still missing a shape-required dimension simply keeps the manual
    // "Generate item code" button on the SM detail page. We never fail the
    // enquiry over item generation — the enquiry is already committed.
    for (const productId of created.productIds) {
      try {
        await generateItemForInquiryItem(productId);
      } catch (genErr) {
        console.error("[createInquiry] auto item generation failed", productId, genErr);
      }
    }

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
  // NOTE (Phase A): edits update only the legacy single-product columns; inquiry_items are NOT synced here — product editing arrives in Phase B.
  await requireUser();
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
    await db
      .update(inquiries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  } catch (err) {
    console.error("[updateInquiry] failed", err);
    return { ok: false, error: "Could not save the inquiry. Please try again." };
  }
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${id}`);
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
  await requireUser();
  if (!isUuid(inquiryItemId)) return { ok: false, error: "Invalid product id." };

  try {
    // Load the inquiry_item joined to its parent inquiry for smNumber + companyName.
    const [row] = await db
      .select({
        inquiryId: inquiryItems.inquiryId,
        smNumber: inquiries.smNumber,
        companyName: inquiries.companyName,
        shape: inquiryItems.shape,
        gradeId: inquiryItems.gradeId,
        toleranceId: inquiryItems.toleranceId,
        conditionId: inquiryItems.conditionId,
        custProductName: inquiryItems.custProductName,
        custDrawingNo: inquiryItems.custDrawingNo,
        drawingRevisionNo: inquiryItems.drawingRevisionNo,
        gradeCustomer: inquiryItems.gradeCustomer,
        quantityNos: inquiryItems.quantityNos,
        outerDia: inquiryItems.outerDia,
        innerDia: inquiryItems.innerDia,
        length: inquiryItems.length,
        width: inquiryItems.width,
        thickness: inquiryItems.thickness,
        dimensionNotes: inquiryItems.dimensionNotes,
        itemId: inquiryItems.itemId,
      })
      .from(inquiryItems)
      .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
      .where(eq(inquiryItems.id, inquiryItemId))
      .limit(1);

    if (!row) return { ok: false, error: "Product not found." };

    // Resolve shape TEXT → master_options uuid of kind 'shape'.
    let shapeId: string | undefined;
    if (row.shape) {
      const [shapeRow] = await db
        .select({ id: masterOptions.id })
        .from(masterOptions)
        .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.name, row.shape)))
        .limit(1);
      shapeId = shapeRow?.id;
    }

    // Parse numeric string columns → numbers (null/"" → undefined).
    const toNum = (v: string | null | undefined): number | undefined => {
      if (v == null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const { createItem } = await import("@/app/(app)/items/actions");
    const result = await createItem({
      inquiryId: row.inquiryId,
      smNumber: row.smNumber,
      customerName: row.companyName ?? undefined,
      custProductName: row.custProductName ?? undefined,
      custDrawingNo: row.custDrawingNo ?? undefined,
      drawingRevisionNo: row.drawingRevisionNo ?? undefined,
      qty: toNum(row.quantityNos),
      shapeId,
      internalGradeId: row.gradeId ?? undefined,
      toleranceId: row.toleranceId ?? undefined,
      conditionId: row.conditionId ?? undefined,
      gradeCustomer: row.gradeCustomer ?? undefined,
      outerDia: toNum(row.outerDia),
      innerDia: toNum(row.innerDia),
      length: toNum(row.length),
      width: toNum(row.width),
      thickness: toNum(row.thickness),
      dimensionNotes: row.dimensionNotes ?? undefined,
    });

    if (!result.ok) return { ok: false, error: result.error };

    // Write item_id back to this inquiry_items row.
    await db
      .update(inquiryItems)
      .set({ itemId: result.id, updatedAt: new Date() })
      .where(eq(inquiryItems.id, inquiryItemId));

    revalidatePath(`/inquiries/${row.inquiryId}`);
    revalidatePath("/items");

    return { ok: true, itemCode: result.itemCode, reused: result.reused };
  } catch (err) {
    console.error("[generateItemForInquiryItem] failed", err);
    return { ok: false, error: "Could not generate the item code. Please try again." };
  }
}
