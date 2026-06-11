"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { masterOptions, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  CreateMasterSchema,
  UpdateMasterSchema,
  MasterIdSchema,
  type CreateMasterInput,
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
