import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formCustomOptions } from "@/db/schema";
import { CUSTOM_LISTS, categoryFor } from "@/lib/custom-lists/registry";

/**
 * Active option labels for one (formKey, listKey), ordered. Falls back to the
 * registry defaults when the list is empty OR the table is missing (i.e. the
 * migration hasn't been applied yet) so the dependent form dropdowns always
 * have options.
 */
export async function listCustomOptions(
  formKey: string,
  listKey: string,
): Promise<string[]> {
  const def = CUSTOM_LISTS[formKey]?.lists.find((l) => l.key === listKey);
  try {
    const rows = await db
      .select({ label: formCustomOptions.label })
      .from(formCustomOptions)
      .where(
        and(
          eq(formCustomOptions.formKey, formKey),
          eq(formCustomOptions.listKey, listKey),
          eq(formCustomOptions.isActive, true),
        ),
      )
      .orderBy(asc(formCustomOptions.sortOrder), asc(formCustomOptions.label));
    if (rows.length > 0) return rows.map((r) => r.label);
  } catch {
    // Table not migrated yet — fall through to the registry defaults.
  }
  return def?.defaults ?? [];
}

/**
 * Every list for a form, resolved to its effective options (DB when present,
 * else registry defaults). Single query — drives the form pages that need all
 * of a form's dropdowns at once.
 */
export async function listCustomOptionsMap(
  formKey: string,
): Promise<Record<string, string[]>> {
  const def = CUSTOM_LISTS[formKey];
  if (!def) return {};
  let rows: { listKey: string; label: string }[] = [];
  try {
    rows = await db
      .select({ listKey: formCustomOptions.listKey, label: formCustomOptions.label })
      .from(formCustomOptions)
      .where(
        and(
          eq(formCustomOptions.formKey, formKey),
          eq(formCustomOptions.isActive, true),
        ),
      )
      .orderBy(asc(formCustomOptions.sortOrder), asc(formCustomOptions.label));
  } catch {
    rows = [];
  }
  const map: Record<string, string[]> = {};
  for (const l of def.lists) {
    const dbOpts = rows.filter((r) => r.listKey === l.key).map((r) => r.label);
    map[l.key] = dbOpts.length ? dbOpts : l.defaults;
  }
  return map;
}

export interface CustomListView {
  key: string;
  label: string;
  hint?: string;
  kind: "text" | "number";
  /** Editor grouping category. */
  category: string;
  /** Whether these are live DB rows (editable) or the registry defaults. */
  seeded: boolean;
  options: { id: string; label: string; sortOrder: number }[];
}

/**
 * All of a form's lists shaped for the "Custom" editor. When a list has no DB
 * rows yet, its `options` are the registry defaults with `seeded: false` (the
 * editor offers to import them). Admin/authed caller.
 */
export async function listCustomListsForForm(
  formKey: string,
): Promise<CustomListView[]> {
  const def = CUSTOM_LISTS[formKey];
  if (!def) return [];
  let rows: { id: string; listKey: string; label: string; sortOrder: number }[] = [];
  try {
    rows = await db
      .select({
        id: formCustomOptions.id,
        listKey: formCustomOptions.listKey,
        label: formCustomOptions.label,
        sortOrder: formCustomOptions.sortOrder,
      })
      .from(formCustomOptions)
      .where(
        and(
          eq(formCustomOptions.formKey, formKey),
          eq(formCustomOptions.isActive, true),
        ),
      )
      .orderBy(asc(formCustomOptions.sortOrder), asc(formCustomOptions.label));
  } catch {
    rows = [];
  }
  return def.lists.map((l) => {
    const dbOpts = rows
      .filter((r) => r.listKey === l.key)
      .map((r) => ({ id: r.id, label: r.label, sortOrder: r.sortOrder }));
    return {
      key: l.key,
      label: l.label,
      hint: l.hint,
      kind: l.kind ?? "text",
      category: categoryFor(formKey, l.key),
      seeded: dbOpts.length > 0,
      options: dbOpts.length
        ? dbOpts
        : l.defaults.map((label, i) => ({ id: `default-${i}`, label, sortOrder: i })),
    };
  });
}
