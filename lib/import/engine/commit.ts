import "server-only";
import { createMasterOptionsBulk } from "@/app/(admin)/admin/masters/actions";
import { listMasterOptions } from "@/lib/queries/masters";
import { isCreateMarker, type ImportRowPayload, type RefKind } from "./spec";
import type { MasterKind } from "@/db/enums";

export interface ImportCommitResult {
  ok: boolean;
  created: number;
  skipped: number;
  newMasters: number;
  errors: { row: number; reason: string }[];
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
  /** The form's existing create action — reused so business logic (auto
   *  numbering, upserts, snapshots) stays identical to single-record entry. */
  createRecord: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
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

  // 3. Create one record per row.
  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rows[i]!)) {
      const rv = resolveVal(v);
      if (rv !== null && rv !== undefined && rv !== "") input[k] = rv;
    }
    for (const [k, dv] of Object.entries(opts.defaults ?? {})) {
      if (input[k] === undefined) input[k] = dv;
    }
    try {
      const res = await opts.createRecord(input);
      if (res.ok) created++;
      else errors.push({ row: i + 1, reason: res.error ?? "create failed" });
    } catch (e) {
      errors.push({ row: i + 1, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return { ok: errors.length === 0, created, skipped: errors.length, newMasters, errors };
}
