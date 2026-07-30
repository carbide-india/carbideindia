"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  masterOptions,
  settingsEvents,
  items,
  inquiries,
  inquiryItems,
  jobCards,
  clients,
  rmLots,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import { MASTER_KIND_LABELS } from "@/db/enums";
import {
  CreateMasterSchema,
  BulkCreateMasterSchema,
  UpdateMasterSchema,
  MasterIdSchema,
  type CreateMasterInput,
  type BulkCreateMasterInput,
  type UpdateMasterInput,
} from "@/lib/validators/master";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const DUPLICATE_ERROR = "An option with this name already exists for this kind.";

/** True when the DB rejected the write on `master_options_kind_name_uidx`. */
function isDuplicateError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("master_options_kind_name_uidx");
}

function revalidateMasterSurfaces() {
  revalidatePath("/admin/masters");
  updateTag(CACHE_TAGS.masters);
}

export async function createMasterOption(
  input: CreateMasterInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateMasterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: masterOptions.id })
    .from(masterOptions)
    .where(
      and(
        eq(masterOptions.kind, parsed.data.kind),
        sql`lower(${masterOptions.name}) = lower(${parsed.data.name})`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: DUPLICATE_ERROR };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(masterOptions)
      .values({
        kind: parsed.data.kind,
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning();
  } catch (err: unknown) {
    if (isDuplicateError(err)) {
      return { ok: false, error: DUPLICATE_ERROR };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(settingsEvents).values({
      scope: "master",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: {
        kind: inserted.kind,
        name: inserted.name,
        sortOrder: inserted.sortOrder,
      },
    });
  } catch (err) {
    console.error("[createMasterOption] audit write failed", err);
  }

  revalidateMasterSurfaces();
  return { ok: true, id: inserted.id };
}

export async function createMasterOptionsBulk(
  input: BulkCreateMasterInput,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  await requireAdmin();

  const parsed = BulkCreateMasterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Dedupe case-insensitively (trim already applied by NameSchema), keep first.
  const seen = new Set<string>();
  const dedupedNames: string[] = [];
  for (const name of parsed.data.names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedNames.push(name);
  }

  const rows = dedupedNames.map((name, i) => ({
    kind: parsed.data.kind,
    name,
    sortOrder: 1000 + i,
  }));

  let returned: { id: string }[];
  try {
    returned = await db
      .insert(masterOptions)
      .values(rows)
      // onConflictDoNothing with no target lets PG infer any unique violation,
      // including the (kind, lower(name)) expression index - rows that already
      // exist are silently skipped.
      .onConflictDoNothing()
      .returning({ id: masterOptions.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const created = returned.length;
  const skipped = dedupedNames.length - created;

  revalidateMasterSurfaces();
  return { ok: true, created, skipped };
}

export async function updateMasterOption(
  masterId: string,
  fields: UpdateMasterInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = MasterIdSchema.safeParse(masterId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid id" };
  }

  const parsed = UpdateMasterSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const option = await db.query.masterOptions.findFirst({
    where: eq(masterOptions.id, parsedId.data),
  });
  if (!option) return { ok: false, error: "Master option not found" };

  if (parsed.data.name !== undefined && parsed.data.name !== option.name) {
    const clash = await db
      .select({ id: masterOptions.id })
      .from(masterOptions)
      .where(
        and(
          eq(masterOptions.kind, option.kind),
          sql`lower(${masterOptions.name}) = lower(${parsed.data.name})`,
        ),
      )
      .limit(1);
    if (clash[0] && clash[0].id !== option.id) {
      return { ok: false, error: DUPLICATE_ERROR };
    }
  }

  const patch: Partial<typeof masterOptions.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;
  if (parsed.data.config !== undefined) patch.config = parsed.data.config;

  try {
    await db.update(masterOptions).set(patch).where(eq(masterOptions.id, option.id));
  } catch (err: unknown) {
    if (isDuplicateError(err)) {
      return { ok: false, error: DUPLICATE_ERROR };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== option.name) {
      fromValue.name = option.name;
      toValue.name = parsed.data.name;
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== option.isActive) {
      fromValue.isActive = option.isActive;
      toValue.isActive = parsed.data.isActive;
    }
    if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== option.sortOrder) {
      fromValue.sortOrder = option.sortOrder;
      toValue.sortOrder = parsed.data.sortOrder;
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "master",
        targetId: option.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateMasterOption] audit write failed", err);
  }

  revalidateMasterSurfaces();
  return { ok: true };
}

/**
 * Hard-delete a master option - ONLY when it is referenced nowhere. If any
 * record in the DB points at this option (scalar FKs or the client array
 * columns), we refuse and tell the admin to deactivate it instead. This keeps
 * the delete safe even though the FKs are `on delete set null` (which would
 * otherwise silently blank live records).
 */
export async function deleteMasterOption(masterId: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = MasterIdSchema.safeParse(masterId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid id" };
  }
  const id = parsedId.data;

  const option = await db.query.masterOptions.findFirst({
    where: eq(masterOptions.id, id),
  });
  if (!option) return { ok: false, error: "Master option not found" };

  let refs = 0;
  try {
    const counts = await Promise.all([
      // items
      db.$count(items, eq(items.shapeId, id)),
      db.$count(items, eq(items.internalGradeId, id)),
      db.$count(items, eq(items.toleranceId, id)),
      db.$count(items, eq(items.conditionId, id)),
      // inquiries
      db.$count(inquiries, eq(inquiries.gradeId, id)),
      db.$count(inquiries, eq(inquiries.toleranceId, id)),
      db.$count(inquiries, eq(inquiries.conditionId, id)),
      // inquiryItems
      db.$count(inquiryItems, eq(inquiryItems.gradeId, id)),
      db.$count(inquiryItems, eq(inquiryItems.toleranceId, id)),
      db.$count(inquiryItems, eq(inquiryItems.conditionId, id)),
      // jobCards
      db.$count(jobCards, eq(jobCards.dispatchConditionId, id)),
      db.$count(jobCards, eq(jobCards.toleranceId, id)),
      db.$count(jobCards, eq(jobCards.pressingTypeId, id)),
      // clients - scalar FKs
      db.$count(clients, eq(clients.customerTypeId, id)),
      db.$count(clients, eq(clients.industryTypeId, id)),
      // clients - array columns (SQL array containment)
      db.$count(clients, sql`${clients.customerTypeIds} @> ARRAY[${id}]::uuid[]`),
      db.$count(clients, sql`${clients.industryTypeIds} @> ARRAY[${id}]::uuid[]`),
      db.$count(clients, sql`${clients.productTypeIds} @> ARRAY[${id}]::uuid[]`),
      // department + grade FKs that are ON DELETE SET NULL - must be counted too,
      // else deleting a referenced option silently NULLs live records (dept on
      // clients/inquiries, and the 15-year rm_lots grade traceability link).
      db.$count(clients, eq(clients.departmentId, id)),
      db.$count(inquiries, eq(inquiries.departmentId, id)),
      db.$count(rmLots, eq(rmLots.internalGradeId, id)),
    ]);
    refs = counts.reduce((sum, n) => sum + n, 0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  if (refs > 0) {
    return {
      ok: false,
      error: `In use by ${refs} record(s) - deactivate it instead.`,
    };
  }

  try {
    await db.delete(masterOptions).where(eq(masterOptions.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "master",
      targetId: option.id,
      actorId: me.id,
      eventType: "deleted",
      fromValue: {
        kind: option.kind,
        name: option.name,
        sortOrder: option.sortOrder,
      },
    });
  } catch (err) {
    console.error("[deleteMasterOption] audit write failed", err);
  }

  await recordAudit({
    entityType: "master_option",
    entityId: option.id,
    entityLabel: option.name,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `${MASTER_KIND_LABELS[option.kind]} "${option.name}" deleted`,
  });

  revalidateMasterSurfaces();
  return { ok: true };
}
