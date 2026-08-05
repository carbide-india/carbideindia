"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, currencies, orgSettings, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import { countCurrencyUsage } from "@/lib/queries/currency";
import {
  BackfillCreditDefaultsSchema,
  CreateCurrencySchema,
  CurrencyIdSchema,
  UpdateCreditPolicySchema,
  UpdateCurrencySchema,
  type BackfillCreditDefaultsInput,
  type CreateCurrencyInput,
  type UpdateCreditPolicyInput,
  type UpdateCurrencyInput,
} from "@/lib/validators/currency";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * The ledger currency. Every rupee figure in costing, quotations, sales orders
 * and invoices is stored in INR with no re-denomination path, so the base row
 * is pinned here rather than being an admin choice.
 */
const LEDGER_CURRENCY_CODE = "INR";

/** Non-fatal settings-event write — mirrors the departments/settings actions. */
async function logSettingsEvent(args: {
  actorId: string;
  targetId: string;
  eventType: string;
  fromValue?: Record<string, unknown> | null;
  toValue?: Record<string, unknown> | null;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "currency",
      targetId: args.targetId,
      actorId: args.actorId,
      eventType: args.eventType,
      fromValue: args.fromValue ?? null,
      toValue: args.toValue ?? null,
      note: args.note ?? null,
    });
  } catch (err) {
    console.error("[currency] settings-event write failed", err);
  }
}

function revalidateCurrency(): void {
  revalidatePath("/admin/currency");
}

// ── Currency master ─────────────────────────────────────────────────────────

export async function createCurrency(
  input: CreateCurrencyInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateCurrencySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.currencies.findFirst({
    where: eq(currencies.code, parsed.data.code),
  });
  if (existing) {
    return { ok: false, error: `${parsed.data.code} already exists in the currency master.` };
  }

  // A new row is never the base — the base flag only ever moves through
  // repairBaseCurrency, so re-adding INR on an unseeded database is safe.
  let inserted;
  try {
    [inserted] = await db
      .insert(currencies)
      .values({
        code: parsed.data.code,
        name: parsed.data.name,
        symbol: parsed.data.symbol ?? "",
        exchangeRateToInr: parsed.data.exchangeRateToInr,
        rateUpdatedAt: new Date(),
        isBase: false,
        isActive: true,
        sortOrder: parsed.data.sortOrder ?? 100,
        updatedById: me.id,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("currencies_code")) {
      return { ok: false, error: `${parsed.data.code} already exists in the currency master.` };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await logSettingsEvent({
    actorId: me.id,
    targetId: inserted.id,
    eventType: "created",
    toValue: {
      code: inserted.code,
      name: inserted.name,
      exchangeRateToInr: inserted.exchangeRateToInr,
    },
  });
  await recordAudit({
    entityType: "currency",
    entityId: inserted.id,
    entityLabel: inserted.code,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: `Added currency ${inserted.code} at ${inserted.exchangeRateToInr} INR per unit`,
  });

  revalidateCurrency();
  return { ok: true, id: inserted.id };
}

export async function updateCurrency(
  currencyId: string,
  fields: UpdateCurrencyInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = CurrencyIdSchema.safeParse(currencyId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid currency id" };
  }
  const parsed = UpdateCurrencySchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const row = await db.query.currencies.findFirst({
    where: eq(currencies.id, parsedId.data),
  });
  if (!row) return { ok: false, error: "Currency not found" };

  const patch: Partial<typeof currencies.$inferInsert> = {
    updatedAt: new Date(),
    updatedById: me.id,
  };
  const fromValue: Record<string, unknown> = {};
  const toValue: Record<string, unknown> = {};

  if (parsed.data.code !== undefined && parsed.data.code !== row.code) {
    if (row.isBase) {
      return { ok: false, error: "The base currency code cannot be changed." };
    }
    // The code is written as plain text onto enquiries and clients, so renaming
    // it once records exist would orphan them.
    const usage = await countCurrencyUsage(row.code);
    if (usage.total > 0) {
      return {
        ok: false,
        error: `${row.code} is referenced by ${usage.total} record${usage.total === 1 ? "" : "s"}; the code can no longer be changed.`,
      };
    }
    const clash = await db.query.currencies.findFirst({
      where: eq(currencies.code, parsed.data.code),
    });
    if (clash) {
      return { ok: false, error: `${parsed.data.code} already exists in the currency master.` };
    }
    patch.code = parsed.data.code;
    fromValue.code = row.code;
    toValue.code = parsed.data.code;
  }

  if (parsed.data.name !== undefined && parsed.data.name !== row.name) {
    patch.name = parsed.data.name;
    fromValue.name = row.name;
    toValue.name = parsed.data.name;
  }
  if (parsed.data.symbol !== undefined && parsed.data.symbol !== row.symbol) {
    patch.symbol = parsed.data.symbol;
    fromValue.symbol = row.symbol;
    toValue.symbol = parsed.data.symbol;
  }
  if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== row.sortOrder) {
    patch.sortOrder = parsed.data.sortOrder;
    fromValue.sortOrder = row.sortOrder;
    toValue.sortOrder = parsed.data.sortOrder;
  }

  if (parsed.data.exchangeRateToInr !== undefined) {
    const nextRate = parsed.data.exchangeRateToInr;
    if (row.isBase && Number(nextRate) !== 1) {
      return {
        ok: false,
        error: "The base currency is the unit of the ledger — its rate is fixed at 1.",
      };
    }
    if (Number(nextRate) !== Number(row.exchangeRateToInr)) {
      patch.exchangeRateToInr = nextRate;
      // Rates are maintained by hand; the stamp is what "last updated" shows.
      patch.rateUpdatedAt = new Date();
      fromValue.exchangeRateToInr = row.exchangeRateToInr;
      toValue.exchangeRateToInr = nextRate;
    }
  }

  if (Object.keys(toValue).length === 0) {
    return { ok: false, error: "No changes to save." };
  }

  try {
    await db.update(currencies).set(patch).where(eq(currencies.id, row.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("currencies_code")) {
      return { ok: false, error: "That currency code already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  await logSettingsEvent({
    actorId: me.id,
    targetId: row.id,
    eventType: "updated",
    fromValue,
    toValue,
  });
  await recordAudit({
    entityType: "currency",
    entityId: row.id,
    entityLabel: (patch.code as string | undefined) ?? row.code,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Updated ${row.code}: ${Object.keys(toValue).join(", ")}`,
  });

  revalidateCurrency();
  return { ok: true };
}

/**
 * Deactivate / reactivate. Governance is deactivate-only: currencies are never
 * hard-deleted, and the base currency or one referenced by live records cannot
 * be switched off at all.
 */
export async function setCurrencyActive(
  currencyId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = CurrencyIdSchema.safeParse(currencyId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid currency id" };
  }
  if (typeof isActive !== "boolean") {
    return { ok: false, error: "Invalid state" };
  }

  const row = await db.query.currencies.findFirst({
    where: eq(currencies.id, parsedId.data),
  });
  if (!row) return { ok: false, error: "Currency not found" };
  if (row.isActive === isActive) {
    return { ok: false, error: `${row.code} is already ${isActive ? "active" : "inactive"}.` };
  }

  if (!isActive) {
    const settings = await db.query.orgSettings.findFirst({
      where: eq(orgSettings.id, 1),
    });
    if (row.isBase || row.code === (settings?.baseCurrencyCode ?? LEDGER_CURRENCY_CODE)) {
      return { ok: false, error: `${row.code} is the base currency and must stay active.` };
    }
    const usage = await countCurrencyUsage(row.code);
    if (usage.total > 0) {
      const parts: string[] = [];
      if (usage.inquiries > 0) parts.push(`${usage.inquiries} enquir${usage.inquiries === 1 ? "y" : "ies"}`);
      if (usage.clients > 0) parts.push(`${usage.clients} client${usage.clients === 1 ? "" : "s"}`);
      return {
        ok: false,
        error: `${row.code} is used by ${parts.join(" and ")}. Clear those records first.`,
      };
    }
  }

  try {
    await db
      .update(currencies)
      .set({ isActive, updatedAt: new Date(), updatedById: me.id })
      .where(eq(currencies.id, row.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logSettingsEvent({
    actorId: me.id,
    targetId: row.id,
    eventType: isActive ? "reactivated" : "deactivated",
    fromValue: { isActive: row.isActive },
    toValue: { isActive },
  });
  await recordAudit({
    entityType: "currency",
    entityId: row.id,
    entityLabel: row.code,
    action: isActive ? "restore" : "update",
    actorId: me.id,
    actorName: me.name,
    summary: `${isActive ? "Reactivated" : "Deactivated"} currency ${row.code}`,
  });

  revalidateCurrency();
  return { ok: true };
}

/**
 * Repair the base flag: exactly one row must carry `is_base`, it must be INR,
 * its rate must be 1, and `org_settings.base_currency_code` must agree. Runs in
 * one transaction because there is no DB constraint holding the invariant.
 */
export async function repairBaseCurrency(): Promise<ActionResult> {
  const me = await requireAdmin();

  const inr = await db.query.currencies.findFirst({
    where: eq(currencies.code, LEDGER_CURRENCY_CODE),
  });
  if (!inr) {
    return {
      ok: false,
      error: `No ${LEDGER_CURRENCY_CODE} row exists. Run the default seed before repairing the base currency.`,
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(currencies)
        .set({ isBase: false, updatedAt: new Date(), updatedById: me.id })
        .where(and(eq(currencies.isBase, true), ne(currencies.id, inr.id)));
      await tx
        .update(currencies)
        .set({
          isBase: true,
          isActive: true,
          exchangeRateToInr: "1",
          updatedAt: new Date(),
          updatedById: me.id,
        })
        .where(eq(currencies.id, inr.id));
      await tx
        .update(orgSettings)
        .set({
          baseCurrencyCode: LEDGER_CURRENCY_CODE,
          updatedAt: new Date(),
          updatedById: me.id,
        })
        .where(eq(orgSettings.id, 1));
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logSettingsEvent({
    actorId: me.id,
    targetId: inr.id,
    eventType: "base_repaired",
    toValue: { baseCurrencyCode: LEDGER_CURRENCY_CODE },
    note: "Base currency pinned to the ledger currency",
  });
  await recordAudit({
    entityType: "currency",
    entityId: inr.id,
    entityLabel: LEDGER_CURRENCY_CODE,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Base currency repaired to ${LEDGER_CURRENCY_CODE}`,
  });

  revalidateCurrency();
  revalidatePath("/admin/settings");
  return { ok: true };
}

// ── Credit policy ───────────────────────────────────────────────────────────

export async function updateCreditPolicy(
  input: UpdateCreditPolicyInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = UpdateCreditPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, 1),
  });
  if (!before) {
    return {
      ok: false,
      error: "Organisation settings row is missing. Run the migrations and seed first.",
    };
  }

  const nextLimit =
    parsed.data.defaultCreditLimit === null || parsed.data.defaultCreditLimit === ""
      ? null
      : parsed.data.defaultCreditLimit;
  const nextTerms =
    parsed.data.defaultPaymentTerms === null || parsed.data.defaultPaymentTerms === ""
      ? null
      : parsed.data.defaultPaymentTerms;

  const unchanged =
    before.defaultCreditDays === parsed.data.defaultCreditDays &&
    Number(before.defaultCreditLimit ?? NaN) === Number(nextLimit ?? NaN) &&
    (before.defaultCreditLimit === null) === (nextLimit === null) &&
    (before.defaultPaymentTerms ?? null) === nextTerms;
  if (unchanged) return { ok: false, error: "No changes to save." };

  try {
    await db
      .update(orgSettings)
      .set({
        defaultCreditDays: parsed.data.defaultCreditDays,
        defaultCreditLimit: nextLimit,
        defaultPaymentTerms: nextTerms,
        updatedAt: new Date(),
        updatedById: me.id,
      })
      .where(eq(orgSettings.id, 1));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "org_settings",
      targetId: "1",
      actorId: me.id,
      eventType: "credit_policy_updated",
      fromValue: {
        defaultCreditDays: before.defaultCreditDays,
        defaultCreditLimit: before.defaultCreditLimit,
        defaultPaymentTerms: before.defaultPaymentTerms,
      },
      toValue: {
        defaultCreditDays: parsed.data.defaultCreditDays,
        defaultCreditLimit: nextLimit,
        defaultPaymentTerms: nextTerms,
      },
    });
  } catch (err) {
    console.error("[updateCreditPolicy] settings-event write failed", err);
  }
  await recordAudit({
    entityType: "org_settings",
    entityId: "1",
    entityLabel: "Credit policy",
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Default credit terms set to ${parsed.data.defaultCreditDays} days`,
  });

  revalidateCurrency();
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Apply the org defaults to active clients that have no value of their own.
 * NULL-only by design — an existing per-client override is never overwritten,
 * so this is safe to re-run.
 */
export async function backfillClientCreditDefaults(
  input: BackfillCreditDefaultsInput,
): Promise<ActionResult<{ creditDays: number; creditLimit: number; paymentTerms: number }>> {
  const me = await requireAdmin();

  const parsed = BackfillCreditDefaultsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, 1),
  });
  if (!settings) {
    return {
      ok: false,
      error: "Organisation settings row is missing. Run the migrations and seed first.",
    };
  }
  if (parsed.data.creditLimit && settings.defaultCreditLimit === null) {
    return { ok: false, error: "Set a default credit limit before backfilling it." };
  }
  if (parsed.data.paymentTerms && !settings.defaultPaymentTerms) {
    return { ok: false, error: "Set default payment terms before backfilling them." };
  }

  const live = and(eq(clients.isActive, true), isNull(clients.deletedAt));
  let daysCount = 0;
  let limitCount = 0;
  let termsCount = 0;

  try {
    await db.transaction(async (tx) => {
      if (parsed.data.creditDays) {
        const touched = await tx
          .update(clients)
          .set({ creditDays: settings.defaultCreditDays, updatedAt: new Date() })
          .where(and(live, isNull(clients.creditDays)))
          .returning({ id: clients.id });
        daysCount = touched.length;
      }
      if (parsed.data.creditLimit) {
        const touched = await tx
          .update(clients)
          .set({ creditLimit: settings.defaultCreditLimit, updatedAt: new Date() })
          .where(and(live, isNull(clients.creditLimit)))
          .returning({ id: clients.id });
        limitCount = touched.length;
      }
      if (parsed.data.paymentTerms) {
        const touched = await tx
          .update(clients)
          .set({ paymentTerms: settings.defaultPaymentTerms, updatedAt: new Date() })
          .where(
            and(
              live,
              sql`(${clients.paymentTerms} is null or btrim(${clients.paymentTerms}) = '')`,
            ),
          )
          .returning({ id: clients.id });
        termsCount = touched.length;
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "org_settings",
      targetId: "1",
      actorId: me.id,
      eventType: "credit_defaults_backfilled",
      toValue: {
        creditDays: daysCount,
        creditLimit: limitCount,
        paymentTerms: termsCount,
      },
      note: "Filled blank client credit fields from the org defaults",
    });
  } catch (err) {
    console.error("[backfillClientCreditDefaults] settings-event write failed", err);
  }
  await recordAudit({
    entityType: "clients",
    entityId: "bulk",
    entityLabel: "Credit defaults backfill",
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Backfilled credit defaults — ${daysCount} credit days, ${limitCount} credit limits, ${termsCount} payment terms`,
  });

  revalidateCurrency();
  revalidatePath("/clients");
  return {
    ok: true,
    creditDays: daysCount,
    creditLimit: limitCount,
    paymentTerms: termsCount,
  };
}
