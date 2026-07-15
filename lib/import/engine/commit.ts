import "server-only";
import { createMasterOptionsBulk } from "@/app/(admin)/admin/masters/actions";
import { listMasterOptions } from "@/lib/queries/masters";
import { isCreateMarker, type ImportRowPayload, type RefKind } from "./spec";
import type { MasterKind } from "@/db/enums";

export interface ImportCommitResult {
  ok: boolean;
  created: number;
  skipped: number;
  /** Rows skipped because they duplicate an earlier row or an existing record. */
  duplicates: number;
  newMasters: number;
  errors: { row: number; reason: string }[];
  /** 1-based row numbers that were skipped as duplicates (for the summary). */
  duplicateRows: number[];
}

/** A create-action error that means "this record already exists" (so the row is
 *  a duplicate to skip, not a hard failure). Kept broad on purpose. */
function isDuplicateError(reason: string): boolean {
  return /\b(already exists|duplicate|duplicat)/i.test(reason);
}

/** RefKind → the master_options kind it resolves to (grade is "internal_grade"). */
const MASTER_KIND: Partial<Record<RefKind, MasterKind>> = {
  grade: "internal_grade",
  tolerance: "tolerance",
  condition: "condition",
  shape: "shape",
  customerType: "customer_type",
  industryType: "industry_type",
  productType: "product_type",
};

export interface RunImportCommitOpts {
  /** Field values injected when a row omits them (e.g. { clientMode: "new" }).
   *  Used for required-but-not-in-sheet fields the create action demands. */
  defaults?: Record<string, unknown>;
  /** The form's existing create action - reused so business logic (auto
   *  numbering, upserts, snapshots) stays identical to single-record entry. */
  createRecord: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Field keys that identify a duplicate row. When set, two sheet rows sharing
   * the same (case-insensitive) values for these fields are treated as the same
   * record - the first is imported, later ones are skipped as duplicates. When
   * omitted, an exact whole-row match is used as the fallback identity.
   */
  dedupeKeys?: string[];
}

/**
 * Shared commit engine for every form's bulk import. The caller has already
 * run `requireAdmin()`. Steps: (1) gather staged "+ create new master" markers
 * and create those options, (2) re-fetch each kind to map name→new id, (3) for
 * each row resolve markers → ids, drop empties, inject `defaults`, and create
 * one record via `createRecord`. Partial success with per-row reasons.
 */
export async function runImportCommit(
  rows: ImportRowPayload[],
  opts: RunImportCommitOpts,
): Promise<ImportCommitResult> {
  const errors: ImportCommitResult["errors"] = [];

  // 1. Collect staged master-create intents per master kind.
  const toCreate = new Map<MasterKind, Set<string>>();
  for (const row of rows) {
    for (const v of Object.values(row)) {
      const items = Array.isArray(v) ? v : [v];
      for (const m of items) {
        if (isCreateMarker(m)) {
          const mk = MASTER_KIND[m.__createMaster.kind];
          if (!mk) continue;
          if (!toCreate.has(mk)) toCreate.set(mk, new Set());
          toCreate.get(mk)!.add(m.__createMaster.name);
        }
      }
    }
  }

  // 2. Create them; re-fetch each kind to map lower(name) → id.
  const idByKindName = new Map<string, string>();
  let newMasters = 0;
  for (const [mk, names] of toCreate) {
    const res = await createMasterOptionsBulk({ kind: mk, names: [...names] });
    if (res.ok) newMasters += res.created;
    const masterOpts = await listMasterOptions(mk);
    for (const o of masterOpts) idByKindName.set(`${mk}|${o.name.toLowerCase()}`, o.id);
  }

  function resolveVal(v: unknown): unknown {
    if (isCreateMarker(v)) {
      const mk = MASTER_KIND[v.__createMaster.kind];
      return mk ? idByKindName.get(`${mk}|${v.__createMaster.name.toLowerCase()}`) : undefined;
    }
    if (Array.isArray(v)) return v.map(resolveVal).filter((x) => x !== undefined);
    return v;
  }

  // Identity key for within-file duplicate detection.
  function rowKey(input: Record<string, unknown>): string | null {
    if (opts.dedupeKeys && opts.dedupeKeys.length > 0) {
      const parts = opts.dedupeKeys
        .map((k) => String(input[k] ?? "").trim().toLowerCase())
        .filter(Boolean);
      // No identifying value on this row → can't judge it a duplicate.
      return parts.length ? parts.join("|") : null;
    }
    // Fallback: exact whole-row match (catches copy-paste duplicate rows).
    const norm = Object.keys(input)
      .sort()
      .map((k) => `${k}=${JSON.stringify(input[k])}`)
      .join("&");
    return norm || null;
  }

  // 3. Create one record per row (skipping in-file + existing duplicates).
  let created = 0;
  let duplicates = 0;
  const duplicateRows: number[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rows[i]!)) {
      const rv = resolveVal(v);
      if (rv !== null && rv !== undefined && rv !== "") input[k] = rv;
    }
    for (const [k, dv] of Object.entries(opts.defaults ?? {})) {
      if (input[k] === undefined) input[k] = dv;
    }

    // Within-file duplicate: same identity as an earlier row → skip.
    const key = rowKey(input);
    if (key !== null) {
      if (seenKeys.has(key)) {
        duplicates++;
        duplicateRows.push(i + 1);
        continue;
      }
      seenKeys.add(key);
    }

    try {
      const res = await opts.createRecord(input);
      if (res.ok) {
        created++;
      } else if (res.error && isDuplicateError(res.error)) {
        // Existing-record duplicate (e.g. GSTIN/PAN already on file) → skip.
        duplicates++;
        duplicateRows.push(i + 1);
      } else {
        errors.push({ row: i + 1, reason: res.error ?? "create failed" });
      }
    } catch (e) {
      errors.push({ row: i + 1, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    ok: errors.length === 0,
    created,
    skipped: errors.length + duplicates,
    duplicates,
    newMasters,
    errors,
    duplicateRows,
  };
}
