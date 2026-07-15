"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formCustomOptions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { CUSTOM_LISTS, isKnownCustomList } from "@/lib/custom-lists/registry";

type Result = { ok: true } | { ok: false; error: string };

/** Refresh the editor page + any form that reads this form's dropdowns. */
function revalidateFor(formKey: string): void {
  const def = CUSTOM_LISTS[formKey];
  if (def) revalidatePath(def.editorRoute);
  if (formKey === "kyc") {
    revalidatePath("/clients/new");
    revalidatePath("/clients");
  } else if (formKey === "enquiry") {
    revalidatePath("/enquiries/new");
  } else if (formKey === "sample") {
    revalidatePath("/samples/new");
  }
}

/** Add many options at once (one per line, paste-friendly). Trims, dedupes
 *  within the input, and skips values that already exist. */
export async function addCustomOptionsBulk(
  formKey: string,
  listKey: string,
  labelsRaw: string[],
): Promise<{ ok: true; added: number; skipped: number } | { ok: false; error: string }> {
  await requireUser();
  if (!isKnownCustomList(formKey, listKey)) return { ok: false, error: "Unknown list." };
  // Count every valid pasted value, then dedupe within the paste (case-
  // insensitive) - the difference is the first bucket of skipped duplicates.
  let validCount = 0;
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of labelsRaw) {
    const label = raw.trim();
    if (!label || label.length > 200) continue;
    validCount++;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  if (labels.length === 0) return { ok: false, error: "Paste at least one value." };
  let inserted = 0;
  try {
    const [row] = await db
      .select({ maxSort: sql<number>`coalesce(max(${formCustomOptions.sortOrder}), 0)` })
      .from(formCustomOptions)
      .where(
        and(eq(formCustomOptions.formKey, formKey), eq(formCustomOptions.listKey, listKey)),
      );
    let sort = row?.maxSort ?? 0;
    const values = labels.map((label) => ({ formKey, listKey, label, sortOrder: ++sort }));
    // onConflictDoNothing skips values already in the list; `.returning()` tells
    // us how many were actually inserted so we can report accurate counts.
    const returned = await db
      .insert(formCustomOptions)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: formCustomOptions.id });
    inserted = returned.length;
  } catch {
    return { ok: false, error: "Couldn't save - has migration 0047 been applied?" };
  }
  revalidateFor(formKey);
  // Skipped = within-paste duplicates + values that already existed in the list.
  return { ok: true, added: inserted, skipped: Math.max(0, validCount - inserted) };
}

export async function addCustomOption(
  formKey: string,
  listKey: string,
  labelRaw: string,
): Promise<Result> {
  await requireUser();
  const label = labelRaw.trim();
  if (!label) return { ok: false, error: "Enter a value." };
  if (label.length > 200) return { ok: false, error: "That value is too long." };
  if (!isKnownCustomList(formKey, listKey)) return { ok: false, error: "Unknown list." };
  try {
    const [row] = await db
      .select({ maxSort: sql<number>`coalesce(max(${formCustomOptions.sortOrder}), 0)` })
      .from(formCustomOptions)
      .where(
        and(eq(formCustomOptions.formKey, formKey), eq(formCustomOptions.listKey, listKey)),
      );
    await db
      .insert(formCustomOptions)
      .values({ formKey, listKey, label, sortOrder: (row?.maxSort ?? 0) + 1 })
      .onConflictDoNothing(); // unique (formKey, listKey, lower(label))
  } catch {
    return { ok: false, error: "Couldn't save - has migration 0047 been applied?" };
  }
  revalidateFor(formKey);
  return { ok: true };
}

export async function renameCustomOption(
  id: string,
  labelRaw: string,
  formKey: string,
): Promise<Result> {
  await requireUser();
  const label = labelRaw.trim();
  if (!label) return { ok: false, error: "Enter a value." };
  if (label.length > 200) return { ok: false, error: "That value is too long." };
  try {
    await db
      .update(formCustomOptions)
      .set({ label, updatedAt: new Date() })
      .where(eq(formCustomOptions.id, id));
  } catch {
    return { ok: false, error: "Couldn't save the change." };
  }
  revalidateFor(formKey);
  return { ok: true };
}

export async function removeCustomOption(id: string, formKey: string): Promise<Result> {
  await requireUser();
  try {
    await db
      .update(formCustomOptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(formCustomOptions.id, id));
  } catch {
    return { ok: false, error: "Couldn't remove that option." };
  }
  revalidateFor(formKey);
  return { ok: true };
}

/** Reorder: swap an option with its neighbour (up/down) within its list. */
export async function moveCustomOption(
  formKey: string,
  listKey: string,
  id: string,
  direction: "up" | "down",
): Promise<Result> {
  await requireUser();
  if (!isKnownCustomList(formKey, listKey)) return { ok: false, error: "Unknown list." };
  try {
    const rows = await db
      .select({ id: formCustomOptions.id, sortOrder: formCustomOptions.sortOrder })
      .from(formCustomOptions)
      .where(
        and(
          eq(formCustomOptions.formKey, formKey),
          eq(formCustomOptions.listKey, listKey),
          eq(formCustomOptions.isActive, true),
        ),
      )
      .orderBy(asc(formCustomOptions.sortOrder), asc(formCustomOptions.label));
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false, error: "Option not found." };
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return { ok: true }; // already at the edge
    const a = rows[idx]!;
    const b = rows[swapIdx]!;
    // Swap their sort orders → they swap positions.
    await db.update(formCustomOptions).set({ sortOrder: b.sortOrder }).where(eq(formCustomOptions.id, a.id));
    await db.update(formCustomOptions).set({ sortOrder: a.sortOrder }).where(eq(formCustomOptions.id, b.id));
  } catch {
    return { ok: false, error: "Couldn't reorder." };
  }
  revalidateFor(formKey);
  return { ok: true };
}

/** Clear a whole list (deactivate every option) → reverts it to the defaults
 *  preview, so "Use default options" can be undone. */
export async function clearCustomList(
  formKey: string,
  listKey: string,
): Promise<Result> {
  await requireUser();
  if (!isKnownCustomList(formKey, listKey)) return { ok: false, error: "Unknown list." };
  try {
    await db
      .update(formCustomOptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(formCustomOptions.formKey, formKey),
          eq(formCustomOptions.listKey, listKey),
          eq(formCustomOptions.isActive, true),
        ),
      );
  } catch {
    return { ok: false, error: "Couldn't clear the list." };
  }
  revalidateFor(formKey);
  return { ok: true };
}

/** Import the registry defaults into a list (skips any that already exist). */
export async function seedCustomListDefaults(
  formKey: string,
  listKey: string,
): Promise<Result> {
  await requireUser();
  const def = CUSTOM_LISTS[formKey]?.lists.find((l) => l.key === listKey);
  if (!def) return { ok: false, error: "Unknown list." };
  try {
    await db
      .insert(formCustomOptions)
      .values(
        def.defaults.map((label, i) => ({ formKey, listKey, label, sortOrder: i + 1 })),
      )
      .onConflictDoNothing();
  } catch {
    return { ok: false, error: "Couldn't import - has migration 0047 been applied?" };
  }
  revalidateFor(formKey);
  return { ok: true };
}
