"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { docNumberFormats, docNumberSeries, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import type { FieldChange } from "@/lib/audit/diff";
import { DETECTED_FAMILIES, sequenceExists } from "@/lib/queries/numbering";
import {
  financialYear,
  financialYearStart,
  isFinancialYearLabel,
  nextFinancialYear,
  renderFySeriesNumber,
  renderSequenceNumber,
} from "@/lib/numbering/render";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Ceiling shared by every counter input — an admin typo shouldn't burn 9M numbers. */
const MAX_COUNTER = 10_000_000;

/** Same identifier guard the query module uses before touching a sequence. */
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

const UuidSchema = z.string().uuid("Invalid record id");

const PrefixSchema = z
  .string()
  .max(12, "Prefix is limited to 12 characters")
  .regex(
    /^[A-Za-z0-9#/_-]*$/,
    "Prefix may only contain letters, digits, #, /, _ and -",
  );

const UpdateFormatSchema = z.object({
  id: UuidSchema,
  label: z.string().trim().min(2, "Label is required").max(60, "Label is too long"),
  sortOrder: z
    .number()
    .int("Sort order must be a whole number")
    .min(0, "Sort order cannot be negative")
    .max(9999, "Sort order is too large"),
  isActive: z.boolean(),
  // Only accepted for fy_series families — see the strategy check below.
  prefix: PrefixSchema.optional(),
  padTo: z
    .number()
    .int("Padding must be a whole number")
    .min(0, "Padding cannot be negative")
    .max(8, "Padding is limited to 8 digits")
    .optional(),
});

const FyLabelSchema = z
  .string()
  .trim()
  .refine(isFinancialYearLabel, "Financial year must look like 2026-27");

const SetFyNextSchema = z.object({
  seriesKey: z.string().trim().min(1, "Missing series"),
  fyLabel: FyLabelSchema,
  nextValue: z
    .number()
    .int("Next number must be a whole number")
    .min(1, "Next number must be at least 1")
    .max(MAX_COUNTER, "Next number is too large"),
});

const SetSequenceNextSchema = z.object({
  seriesKey: z.string().trim().min(1, "Missing series"),
  nextValue: z
    .number()
    .int("Next number must be a whole number")
    .min(1, "Next number must be at least 1")
    .max(MAX_COUNTER, "Next number is too large"),
});

const OpenCounterSchema = z.object({
  seriesKey: z.string().trim().min(1, "Missing series"),
  fyLabel: FyLabelSchema,
});

const RegisterFamilySchema = z.object({
  seriesKey: z.string().trim().min(1, "Missing series"),
});

/** First zod issue as a plain sentence, matching the other admin actions. */
function firstIssue(err: z.ZodError, fallback: string): string {
  return err.issues[0]?.message ?? fallback;
}

/** Settings-event breadcrumb. Non-fatal: numbering edits must not fail on it. */
async function noteSettingsEvent(args: {
  actorId: string;
  targetId: string;
  eventType: string;
  fromValue?: Record<string, unknown> | null;
  toValue?: Record<string, unknown> | null;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "doc_numbering",
      targetId: args.targetId,
      actorId: args.actorId,
      eventType: args.eventType,
      fromValue: args.fromValue ?? null,
      toValue: args.toValue ?? null,
      note: args.note ?? null,
    });
  } catch (err) {
    console.error("[numbering] settings event write failed (non-fatal)", err);
  }
}

/**
 * Edit a document family's register entry.
 *
 * `label`, `sortOrder` and `isActive` are register metadata and always
 * editable. `prefix` / `padTo` are only accepted for `fy_series` families,
 * because those are the only ones whose minting path reads them: the allocator
 * (lib/series/next-number.ts) takes prefix + padding off the `doc_number_series`
 * counter row. So a prefix change is ALSO propagated to the counter rows for the
 * current and future financial years — past years keep the prefix their issued
 * documents were printed with. `sequence` and `sm_suffix` prefixes are baked
 * into SQL column DEFAULTs / string literals in code and are rejected here
 * rather than silently saved and ignored.
 */
export async function updateNumberingFormat(input: {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  prefix?: string;
  padTo?: number;
}): Promise<ActionResult<{ propagatedCounters: number }>> {
  const me = await requireAdmin();

  const parsed = UpdateFormatSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, "Invalid input") };
  }
  const v = parsed.data;

  const before = await db.query.docNumberFormats.findFirst({
    where: eq(docNumberFormats.id, v.id),
  });
  if (!before) return { ok: false, error: "That document family no longer exists." };

  const wantsFormatEdit =
    (v.prefix !== undefined && v.prefix !== before.prefix) ||
    (v.padTo !== undefined && v.padTo !== before.padTo);
  if (wantsFormatEdit && before.strategy !== "fy_series") {
    return {
      ok: false,
      error:
        "Prefix and padding for this family are defined in code (column default / server action), not in this register. Edit the label or listing instead.",
    };
  }

  const nextPrefix = v.prefix ?? before.prefix;
  const nextPadTo = v.padTo ?? before.padTo;

  const changes: FieldChange[] = [];
  if (v.label !== before.label) changes.push({ field: "label", old: before.label, new: v.label });
  if (v.sortOrder !== before.sortOrder)
    changes.push({ field: "sortOrder", old: before.sortOrder, new: v.sortOrder });
  if (v.isActive !== before.isActive)
    changes.push({ field: "isActive", old: before.isActive, new: v.isActive });
  if (nextPrefix !== before.prefix)
    changes.push({ field: "prefix", old: before.prefix, new: nextPrefix });
  if (nextPadTo !== before.padTo)
    changes.push({ field: "padTo", old: before.padTo, new: nextPadTo });

  if (changes.length === 0) return { ok: false, error: "No changes to save." };

  const currentFy = financialYear();
  let propagated = 0;

  try {
    propagated = await db.transaction(async (tx) => {
      await tx
        .update(docNumberFormats)
        .set({
          label: v.label,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
          prefix: nextPrefix,
          padTo: nextPadTo,
          updatedById: me.id,
          updatedAt: new Date(),
        })
        .where(eq(docNumberFormats.id, v.id));

      if (
        before.strategy === "fy_series" &&
        (nextPrefix !== before.prefix || nextPadTo !== before.padTo)
      ) {
        // Current + future years only. `fy_label` is "YYYY-YY", so a plain text
        // comparison orders financial years correctly.
        const rows = await tx
          .update(docNumberSeries)
          .set({ prefix: nextPrefix, padTo: nextPadTo, updatedAt: new Date() })
          .where(
            and(
              eq(docNumberSeries.seriesKey, before.seriesKey),
              gte(docNumberSeries.fyLabel, currentFy),
            ),
          )
          .returning({ id: docNumberSeries.id });
        return rows.length;
      }
      return 0;
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordAudit({
    entityType: "doc_number_format",
    entityId: before.id,
    entityLabel: before.seriesKey,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes,
    summary: `Document numbering "${before.seriesKey}" updated${
      propagated > 0 ? ` (${propagated} counter row(s) re-based)` : ""
    }`,
  });
  await noteSettingsEvent({
    actorId: me.id,
    targetId: before.seriesKey,
    eventType: "format_updated",
    fromValue: { label: before.label, prefix: before.prefix, padTo: before.padTo, isActive: before.isActive },
    toValue: { label: v.label, prefix: nextPrefix, padTo: nextPadTo, isActive: v.isActive },
  });

  revalidatePath("/admin/numbering");
  return { ok: true, propagatedCounters: propagated };
}

/**
 * Move an FY counter FORWARD. `nextValue` is the number the next document will
 * carry, so the stored `last_value` becomes `nextValue - 1`.
 *
 * Forward-only is a hard rule: every value up to `last_value` has already been
 * printed on a document, and Indian statute wants a gapless, non-repeating
 * register per financial year. Moving backwards would re-issue those numbers,
 * so it is rejected outright. Moving forward is allowed (it is how you skip past
 * numbers consumed in the old spreadsheet) but it BURNS the skipped numbers —
 * the UI confirms the gap before calling this.
 */
export async function setFySeriesNextValue(input: {
  seriesKey: string;
  fyLabel: string;
  nextValue: number;
}): Promise<ActionResult<{ formatted: string; skipped: number }>> {
  const me = await requireAdmin();

  const parsed = SetFyNextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, "Invalid input") };
  }
  const v = parsed.data;

  const format = await db.query.docNumberFormats.findFirst({
    where: eq(docNumberFormats.seriesKey, v.seriesKey),
  });
  if (!format) return { ok: false, error: "That document family no longer exists." };
  if (format.strategy !== "fy_series") {
    return {
      ok: false,
      error: "This family is not a financial-year register, so it has no FY counter.",
    };
  }

  let result: { formatted: string; skipped: number; previousLast: number };
  try {
    result = await db.transaction(async (tx) => {
      // Lock the counter so a concurrent allocation can't slip a number in
      // between the read and the write.
      const locked = (await tx.execute(sql`
        SELECT "last_value", "prefix", "pad_to"
        FROM "doc_number_series"
        WHERE "series_key" = ${v.seriesKey} AND "fy_label" = ${v.fyLabel}
        FOR UPDATE
      `)) as unknown as Array<{
        last_value: number | string;
        prefix: string;
        pad_to: number | string;
      }>;
      const row = locked[0];
      if (!row) {
        throw new Error(
          `NO_COUNTER:No counter is open for ${v.fyLabel} yet. Open the year first, then set its next number.`,
        );
      }

      const lastValue = Number(row.last_value);
      const newLast = v.nextValue - 1;
      if (newLast < lastValue) {
        throw new Error(
          `BACKWARD:Forward only — ${v.fyLabel} has already issued up to ${lastValue}, so the next number cannot be lower than ${lastValue + 1}.`,
        );
      }
      if (newLast === lastValue) {
        throw new Error(`NOOP:The next number is already ${v.nextValue}.`);
      }

      await tx.execute(sql`
        UPDATE "doc_number_series"
        SET "last_value" = ${newLast}, "updated_at" = now()
        WHERE "series_key" = ${v.seriesKey} AND "fy_label" = ${v.fyLabel}
      `);

      return {
        formatted: renderFySeriesNumber(
          row.prefix,
          v.fyLabel,
          Number(row.pad_to),
          v.nextValue,
        ),
        skipped: newLast - lastValue,
        previousLast: lastValue,
      };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const tagged = /^(NO_COUNTER|BACKWARD|NOOP):/.exec(msg);
    if (tagged) return { ok: false, error: msg.slice(msg.indexOf(":") + 1) };
    console.error("[setFySeriesNextValue] failed", err);
    return { ok: false, error: "Could not update that counter." };
  }

  await recordAudit({
    entityType: "doc_number_series",
    entityId: `${v.seriesKey}/${v.fyLabel}`,
    entityLabel: `${format.label} ${v.fyLabel}`,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes: [
      { field: "lastValue", old: result.previousLast, new: v.nextValue - 1 },
    ],
    summary: `${format.label} ${v.fyLabel} counter moved forward — next number is ${result.formatted} (${result.skipped} number(s) skipped)`,
  });
  await noteSettingsEvent({
    actorId: me.id,
    targetId: `${v.seriesKey}/${v.fyLabel}`,
    eventType: "counter_advanced",
    fromValue: { lastValue: result.previousLast },
    toValue: { lastValue: v.nextValue - 1, nextFormatted: result.formatted },
    note: `${result.skipped} number(s) skipped`,
  });

  revalidatePath("/admin/numbering");
  return { ok: true, formatted: result.formatted, skipped: result.skipped };
}

/**
 * Re-base a Postgres-sequence family (SM number, client/vendor/item codes,
 * meeting, production order, task number). `setval(seq, n, false)` makes `n`
 * itself the next value handed out — the same call the legacy Sales Module card
 * makes. Forward-only for the same reason as the FY counters: a lower value
 * collides with codes already printed on records.
 */
export async function setSequenceNextValue(input: {
  seriesKey: string;
  nextValue: number;
}): Promise<ActionResult<{ formatted: string; skipped: number }>> {
  const me = await requireAdmin();

  const parsed = SetSequenceNextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, "Invalid input") };
  }
  const v = parsed.data;

  const format = await db.query.docNumberFormats.findFirst({
    where: eq(docNumberFormats.seriesKey, v.seriesKey),
  });
  if (!format) return { ok: false, error: "That document family no longer exists." };
  if (format.strategy !== "sequence" || !format.sequenceName) {
    return { ok: false, error: "This family is not backed by a Postgres sequence." };
  }

  const seqName = format.sequenceName;
  // Never interpolate an identifier we haven't proven exists in pg_sequences.
  if (!SAFE_IDENT.test(seqName) || !(await sequenceExists(seqName))) {
    return {
      ok: false,
      error: `The sequence "${seqName}" does not exist in this database. Run the migrations first.`,
    };
  }

  let currentNext: number;
  try {
    const rows = (await db.execute(
      sql.raw(`SELECT last_value, is_called FROM "${seqName}"`),
    )) as unknown as Array<{ last_value: number | string; is_called: boolean }>;
    const row = rows[0];
    if (!row) return { ok: false, error: "Could not read the current counter." };
    const last = Number(row.last_value);
    currentNext = row.is_called ? last + 1 : last;
  } catch (err) {
    console.error("[setSequenceNextValue] read failed", err);
    return { ok: false, error: "Could not read the current counter." };
  }

  if (v.nextValue < currentNext) {
    return {
      ok: false,
      error: `Forward only — this counter is already at ${currentNext}, so the next number cannot be lower.`,
    };
  }
  if (v.nextValue === currentNext) {
    return { ok: false, error: `The next number is already ${currentNext}.` };
  }

  try {
    await db.execute(sql.raw(`SELECT setval('${seqName}', ${v.nextValue}, false)`));
  } catch (err) {
    console.error("[setSequenceNextValue] setval failed", err);
    return { ok: false, error: "Could not update that counter." };
  }

  const formatted = renderSequenceNumber(format.prefix, format.padTo, v.nextValue);
  await recordAudit({
    entityType: "doc_number_sequence",
    entityId: seqName,
    entityLabel: format.label,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes: [{ field: "nextValue", old: currentNext, new: v.nextValue }],
    summary: `${format.label} counter moved forward — next number is ${formatted} (${v.nextValue - currentNext} number(s) skipped)`,
  });
  await noteSettingsEvent({
    actorId: me.id,
    targetId: v.seriesKey,
    eventType: "sequence_advanced",
    fromValue: { nextValue: currentNext },
    toValue: { nextValue: v.nextValue, nextFormatted: formatted },
  });

  revalidatePath("/admin/numbering");
  revalidatePath("/admin/settings");
  return { ok: true, formatted, skipped: v.nextValue - currentNext };
}

/**
 * Pre-open the counter row for a financial year.
 *
 * The allocator creates a counter lazily on first use — and it creates it with
 * the HARDCODED defaults in lib/series/next-number.ts, not with whatever prefix
 * this register carries. Opening the year here writes the row from the register
 * first, so April's first invoice picks up the configured prefix/padding.
 * Restricted to the current and next financial year: back-dating a register
 * would invent a year whose documents were never numbered here.
 */
export async function openFinancialYearCounter(input: {
  seriesKey: string;
  fyLabel: string;
}): Promise<ActionResult<{ formatted: string }>> {
  const me = await requireAdmin();

  const parsed = OpenCounterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, "Invalid input") };
  }
  const v = parsed.data;

  const currentFy = financialYear();
  const allowed = new Set([currentFy, nextFinancialYear(currentFy)].filter(Boolean));
  if (!allowed.has(v.fyLabel)) {
    return {
      ok: false,
      error: `Only the current (${currentFy}) or next financial year can be opened.`,
    };
  }
  // Defensive: a malformed label can't reach here, but keep the invariant local.
  if (financialYearStart(v.fyLabel) === null) {
    return { ok: false, error: "Financial year must look like 2026-27." };
  }

  const format = await db.query.docNumberFormats.findFirst({
    where: eq(docNumberFormats.seriesKey, v.seriesKey),
  });
  if (!format) return { ok: false, error: "That document family no longer exists." };
  if (format.strategy !== "fy_series") {
    return { ok: false, error: "Only financial-year registers have FY counters." };
  }

  let inserted: { id: string } | undefined;
  try {
    [inserted] = await db
      .insert(docNumberSeries)
      .values({
        seriesKey: v.seriesKey,
        fyLabel: v.fyLabel,
        prefix: format.prefix,
        padTo: format.padTo,
        lastValue: 0,
      })
      .onConflictDoNothing({
        target: [docNumberSeries.seriesKey, docNumberSeries.fyLabel],
      })
      .returning({ id: docNumberSeries.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) {
    return { ok: false, error: `${v.fyLabel} is already open for this family.` };
  }

  const formatted = renderFySeriesNumber(format.prefix, v.fyLabel, format.padTo, 1);
  await recordAudit({
    entityType: "doc_number_series",
    entityId: `${v.seriesKey}/${v.fyLabel}`,
    entityLabel: `${format.label} ${v.fyLabel}`,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: `${format.label} register opened for ${v.fyLabel} — first number will be ${formatted}`,
  });
  await noteSettingsEvent({
    actorId: me.id,
    targetId: `${v.seriesKey}/${v.fyLabel}`,
    eventType: "counter_opened",
    toValue: { prefix: format.prefix, padTo: format.padTo, firstNumber: formatted },
  });

  revalidatePath("/admin/numbering");
  return { ok: true, formatted };
}

/**
 * Add a register row for a numbering scheme that exists in code but was never
 * seeded (see DETECTED_FAMILIES). Config/display only — the minting code is
 * untouched — so the choice is restricted to the in-code catalogue rather than
 * accepting an arbitrary series key from the browser.
 */
export async function registerDetectedFamily(input: {
  seriesKey: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = RegisterFamilySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error, "Invalid input") };
  }

  const detected = DETECTED_FAMILIES.find((d) => d.seriesKey === parsed.data.seriesKey);
  if (!detected) {
    return { ok: false, error: "That numbering scheme is not in the detected catalogue." };
  }

  let inserted: { id: string } | undefined;
  try {
    [inserted] = await db
      .insert(docNumberFormats)
      .values({
        seriesKey: detected.seriesKey,
        label: detected.label,
        module: detected.module,
        strategy: detected.strategy,
        prefix: detected.prefix,
        padTo: detected.padTo,
        includeFy: false,
        sequenceName: null,
        sortOrder: 900,
        updatedById: me.id,
      })
      .onConflictDoNothing({ target: docNumberFormats.seriesKey })
      .returning({ id: docNumberFormats.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) {
    return { ok: false, error: "That family is already in the register." };
  }

  await recordAudit({
    entityType: "doc_number_format",
    entityId: inserted.id,
    entityLabel: detected.seriesKey,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: `Document family "${detected.label}" registered from ${detected.source}`,
  });
  await noteSettingsEvent({
    actorId: me.id,
    targetId: detected.seriesKey,
    eventType: "format_registered",
    toValue: { label: detected.label, strategy: detected.strategy, source: detected.source },
  });

  revalidatePath("/admin/numbering");
  return { ok: true, id: inserted.id };
}
