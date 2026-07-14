"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedViews, type SavedView } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

/**
 * Saved-views mutations (ERP redesign - Phase 1 backend). No UI wiring yet - the
 * SavedViews bar (Phase 3) consumes these. Guard: `requireUser` + owner-or-admin
 * (admins may rename/delete a shared view; only the owner or an admin may touch
 * a view). Create always binds the view to the caller.
 */

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateSavedViewInput {
  module: string;
  name: string;
  config?: unknown;
  isShared?: boolean;
  sortOrder?: number;
}

export async function createSavedView(
  input: CreateSavedViewInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();

  const moduleName = input.module?.trim();
  const name = input.name?.trim();
  if (!moduleName) return { ok: false, error: "Module is required." };
  if (!name) return { ok: false, error: "Name is required." };

  let inserted: SavedView | undefined;
  try {
    [inserted] = await db
      .insert(savedViews)
      .values({
        employeeId: me.id,
        module: moduleName,
        name,
        config: (input.config ?? {}) as SavedView["config"],
        isShared: input.isShared ?? false,
        sortOrder: input.sortOrder ?? 100,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  return { ok: true, id: inserted.id };
}

export async function renameSavedView(
  id: string,
  name: string,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid id." };
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const view = await db.query.savedViews.findFirst({
    where: eq(savedViews.id, id),
  });
  if (!view) return { ok: false, error: "Saved view not found." };
  if (view.employeeId !== me.id && !me.isAdmin) {
    return { ok: false, error: "Forbidden" };
  }

  try {
    await db
      .update(savedViews)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(savedViews.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  return { ok: true };
}

export async function deleteSavedView(id: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid id." };

  const view = await db.query.savedViews.findFirst({
    where: eq(savedViews.id, id),
  });
  if (!view) return { ok: false, error: "Saved view not found." };
  if (view.employeeId !== me.id && !me.isAdmin) {
    return { ok: false, error: "Forbidden" };
  }

  try {
    await db.delete(savedViews).where(eq(savedViews.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  return { ok: true };
}
