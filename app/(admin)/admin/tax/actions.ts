"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { hsnCodes, settingsEvents, taxRates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import {
  CreateTaxRateSchema,
  HsnCodeIdSchema,
  HsnFieldsSchema,
  TaxRateIdSchema,
  UpdateTaxRateSchema,
  type CreateTaxRateInput,
  type HsnFieldsInput,
  type UpdateTaxRateInput,
} from "@/lib/validators/tax";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Percent columns are `numeric` — postgres-js hands them back as strings. */
function toNum(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** numeric columns are written back as strings, like the costing/invoice code. */
function toNumeric(n: number): string {
  return String(n);
}

/** settings_events + audit_log in one place; both are non-fatal by contract. */
async function logTaxEvent(args: {
  scope: "tax_rate" | "hsn_code";
  targetId: string;
  actorId: string;
  actorName: string | null;
  eventType: "created" | "updated" | "deactivated" | "reactivated" | "default_changed";
  fromValue?: Record<string, unknown> | null;
  toValue?: Record<string, unknown> | null;
  summary: string;
  label: string;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: args.scope,
      targetId: args.targetId,
      actorId: args.actorId,
      eventType: args.eventType,
      fromValue: args.fromValue ?? null,
      toValue: args.toValue ?? null,
    });
  } catch (err) {
    console.error("[tax] settings_events write failed", err);
  }
  await recordAudit({
    entityType: args.scope,
    entityId: args.targetId,
    entityLabel: args.label,
    action: args.eventType === "created" ? "create" : "update",
    actorId: args.actorId,
    actorName: args.actorName,
    summary: args.summary,
  });
}

function revalidateTax(): void {
  revalidatePath("/admin/tax");
}

// ── Tax rates ────────────────────────────────────────────────────────────────

export async function createTaxRate(
  input: CreateTaxRateInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateTaxRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(taxRates)
      .values({
        label: parsed.data.label,
        ratePercent: toNumeric(parsed.data.ratePercent),
        cgstPercent: toNumeric(parsed.data.cgstPercent),
        sgstPercent: toNumeric(parsed.data.sgstPercent),
        igstPercent: toNumeric(parsed.data.igstPercent),
        sortOrder: parsed.data.sortOrder,
        updatedById: me.id,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("tax_rates_label_uidx")) {
      return { ok: false, error: "A tax rate with this label already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await logTaxEvent({
    scope: "tax_rate",
    targetId: inserted.id,
    actorId: me.id,
    actorName: me.name,
    eventType: "created",
    toValue: {
      label: parsed.data.label,
      ratePercent: parsed.data.ratePercent,
      cgstPercent: parsed.data.cgstPercent,
      sgstPercent: parsed.data.sgstPercent,
      igstPercent: parsed.data.igstPercent,
    },
    summary: `Created tax rate ${parsed.data.label} (${parsed.data.ratePercent}%)`,
    label: parsed.data.label,
  });

  revalidateTax();
  return { ok: true, id: inserted.id };
}

export async function updateTaxRate(
  taxRateId: string,
  fields: UpdateTaxRateInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = TaxRateIdSchema.safeParse(taxRateId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid tax rate id" };
  }
  const parsed = UpdateTaxRateSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await db.query.taxRates.findFirst({
    where: eq(taxRates.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "Tax rate not found" };

  try {
    await db
      .update(taxRates)
      .set({
        label: parsed.data.label,
        ratePercent: toNumeric(parsed.data.ratePercent),
        cgstPercent: toNumeric(parsed.data.cgstPercent),
        sgstPercent: toNumeric(parsed.data.sgstPercent),
        igstPercent: toNumeric(parsed.data.igstPercent),
        sortOrder: parsed.data.sortOrder,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(taxRates.id, before.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("tax_rates_label_uidx")) {
      return { ok: false, error: "A tax rate with this label already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  await logTaxEvent({
    scope: "tax_rate",
    targetId: before.id,
    actorId: me.id,
    actorName: me.name,
    eventType: "updated",
    fromValue: {
      label: before.label,
      ratePercent: toNum(before.ratePercent),
      cgstPercent: toNum(before.cgstPercent),
      sgstPercent: toNum(before.sgstPercent),
      igstPercent: toNum(before.igstPercent),
      sortOrder: before.sortOrder,
    },
    toValue: {
      label: parsed.data.label,
      ratePercent: parsed.data.ratePercent,
      cgstPercent: parsed.data.cgstPercent,
      sgstPercent: parsed.data.sgstPercent,
      igstPercent: parsed.data.igstPercent,
      sortOrder: parsed.data.sortOrder,
    },
    summary: `Updated tax rate ${parsed.data.label} (${parsed.data.ratePercent}%)`,
    label: parsed.data.label,
  });

  revalidateTax();
  return { ok: true };
}

/**
 * Make one rate THE default for new quotation / invoice lines.  There is no DB
 * constraint behind `is_default`, so the clear-then-set has to be atomic —
 * otherwise a crash between the two statements leaves zero (or two) defaults.
 */
export async function setDefaultTaxRate(taxRateId: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = TaxRateIdSchema.safeParse(taxRateId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid tax rate id" };
  }

  const target = await db.query.taxRates.findFirst({
    where: eq(taxRates.id, parsedId.data),
  });
  if (!target) return { ok: false, error: "Tax rate not found" };
  if (!target.isActive) {
    return { ok: false, error: "Reactivate this rate before making it the default." };
  }

  const previous = await db.query.taxRates.findFirst({
    where: eq(taxRates.isDefault, true),
  });

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(taxRates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(taxRates.isDefault, true));
      await tx
        .update(taxRates)
        .set({ isDefault: true, updatedById: me.id, updatedAt: new Date() })
        .where(eq(taxRates.id, target.id));
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logTaxEvent({
    scope: "tax_rate",
    targetId: target.id,
    actorId: me.id,
    actorName: me.name,
    eventType: "default_changed",
    fromValue: previous ? { defaultRate: previous.label } : null,
    toValue: { defaultRate: target.label },
    summary: `Default GST rate set to ${target.label} (${toNum(target.ratePercent)}%)`,
    label: target.label,
  });

  revalidateTax();
  return { ok: true };
}

/**
 * Deactivate / reactivate.  Rates are never deleted — historic invoices quote
 * the rate they were raised at, and governance across this ERP is
 * deactivate-only.  The current default cannot be deactivated: that would
 * silently leave new documents with no rate at all.
 */
export async function setTaxRateActive(
  taxRateId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = TaxRateIdSchema.safeParse(taxRateId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid tax rate id" };
  }
  if (typeof isActive !== "boolean") {
    return { ok: false, error: "Invalid state" };
  }

  const before = await db.query.taxRates.findFirst({
    where: eq(taxRates.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "Tax rate not found" };
  if (before.isActive === isActive) return { ok: true };
  if (!isActive && before.isDefault) {
    return {
      ok: false,
      error: "Make another rate the default before deactivating this one.",
    };
  }

  try {
    await db
      .update(taxRates)
      .set({ isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(taxRates.id, before.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logTaxEvent({
    scope: "tax_rate",
    targetId: before.id,
    actorId: me.id,
    actorName: me.name,
    eventType: isActive ? "reactivated" : "deactivated",
    fromValue: { isActive: before.isActive },
    toValue: { isActive },
    summary: `${isActive ? "Reactivated" : "Deactivated"} tax rate ${before.label}`,
    label: before.label,
  });

  revalidateTax();
  return { ok: true };
}

// ── HSN codes ────────────────────────────────────────────────────────────────

export async function createHsnCode(
  input: HsnFieldsInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = HsnFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // A mapped rate must actually exist — a dangling uuid would silently resolve
  // to "no default rate" at invoicing time.
  if (parsed.data.taxRateId) {
    const rate = await db.query.taxRates.findFirst({
      where: eq(taxRates.id, parsed.data.taxRateId),
    });
    if (!rate) return { ok: false, error: "That tax rate no longer exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(hsnCodes)
      .values({
        code: parsed.data.code,
        description: parsed.data.description || null,
        taxRateId: parsed.data.taxRateId ?? null,
        defaultUom: parsed.data.defaultUom || null,
        updatedById: me.id,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("hsn_codes_code")) {
      return { ok: false, error: `HSN ${parsed.data.code} is already in the master.` };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await logTaxEvent({
    scope: "hsn_code",
    targetId: inserted.id,
    actorId: me.id,
    actorName: me.name,
    eventType: "created",
    toValue: {
      code: parsed.data.code,
      description: parsed.data.description ?? null,
      taxRateId: parsed.data.taxRateId ?? null,
      defaultUom: parsed.data.defaultUom ?? null,
    },
    summary: `Added HSN ${parsed.data.code} to the master`,
    label: parsed.data.code,
  });

  revalidateTax();
  return { ok: true, id: inserted.id };
}

export async function updateHsnCode(
  hsnCodeId: string,
  fields: HsnFieldsInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = HsnCodeIdSchema.safeParse(hsnCodeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid HSN id" };
  }
  const parsed = HsnFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await db.query.hsnCodes.findFirst({
    where: eq(hsnCodes.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "HSN code not found" };

  if (parsed.data.taxRateId) {
    const rate = await db.query.taxRates.findFirst({
      where: eq(taxRates.id, parsed.data.taxRateId),
    });
    if (!rate) return { ok: false, error: "That tax rate no longer exists." };
  }

  try {
    await db
      .update(hsnCodes)
      .set({
        code: parsed.data.code,
        description: parsed.data.description || null,
        taxRateId: parsed.data.taxRateId ?? null,
        defaultUom: parsed.data.defaultUom || null,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(hsnCodes.id, before.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("hsn_codes_code")) {
      return { ok: false, error: `HSN ${parsed.data.code} is already in the master.` };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  await logTaxEvent({
    scope: "hsn_code",
    targetId: before.id,
    actorId: me.id,
    actorName: me.name,
    eventType: "updated",
    fromValue: {
      code: before.code,
      description: before.description,
      taxRateId: before.taxRateId,
      defaultUom: before.defaultUom,
    },
    toValue: {
      code: parsed.data.code,
      description: parsed.data.description ?? null,
      taxRateId: parsed.data.taxRateId ?? null,
      defaultUom: parsed.data.defaultUom ?? null,
    },
    summary: `Updated HSN ${parsed.data.code}`,
    label: parsed.data.code,
  });

  revalidateTax();
  return { ok: true };
}

export async function setHsnCodeActive(
  hsnCodeId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = HsnCodeIdSchema.safeParse(hsnCodeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid HSN id" };
  }
  if (typeof isActive !== "boolean") return { ok: false, error: "Invalid state" };

  const before = await db.query.hsnCodes.findFirst({
    where: eq(hsnCodes.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "HSN code not found" };
  if (before.isActive === isActive) return { ok: true };

  try {
    await db
      .update(hsnCodes)
      .set({ isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(hsnCodes.id, before.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logTaxEvent({
    scope: "hsn_code",
    targetId: before.id,
    actorId: me.id,
    actorName: me.name,
    eventType: isActive ? "reactivated" : "deactivated",
    fromValue: { isActive: before.isActive },
    toValue: { isActive },
    summary: `${isActive ? "Reactivated" : "Deactivated"} HSN ${before.code}`,
    label: before.code,
  });

  revalidateTax();
  return { ok: true };
}

/**
 * Adopt a code that already exists on Item Master rows into the HSN master and
 * map it to a rate in one step — the "unmapped codes" panel's primary action.
 * Idempotent: if another admin adopted it a moment earlier we say so instead of
 * blowing up on the unique index.
 */
export async function adoptItemHsnCode(
  code: string,
  taxRateId: string | null,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = HsnFieldsSchema.safeParse({ code, taxRateId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid HSN code" };
  }

  const existing = await db
    .select({ id: hsnCodes.id })
    .from(hsnCodes)
    .where(sql`upper(${hsnCodes.code}) = ${parsed.data.code}`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: `HSN ${parsed.data.code} is already in the master.` };
  }

  return createHsnCode({
    code: parsed.data.code,
    description: null,
    taxRateId: parsed.data.taxRateId ?? null,
    defaultUom: null,
  });
}
