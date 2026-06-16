"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createInquiry } from "@/app/(app)/inquiries/actions";
import { createMasterOptionsBulk } from "@/app/(admin)/admin/masters/actions";
import { listMasterOptions } from "@/lib/queries/masters";
import { isCreateMarker, type ImportRowPayload, type RefKind } from "@/lib/import/engine/spec";
import type { MasterKind } from "@/db/enums";

export interface ImportCommitResult {
  ok: boolean;
  created: number;
  skipped: number;
  newMasters: number;
  errors: { row: number; reason: string }[];
}

const MASTER_KIND: Partial<Record<RefKind, MasterKind>> = {
  grade: "internal_grade",
  tolerance: "tolerance",
  condition: "condition",
  customerType: "customer_type",
  industryType: "industry_type",
  productType: "product_type",
};

/** Admin-only. Creates any staged masters, then one inquiry per valid row via
 *  the existing createInquiry path (so SM auto-numbering etc. are identical). */
export async function commitEnquiryImport(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  await requireAdmin();
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
    const opts = await listMasterOptions(mk);
    for (const o of opts) idByKindName.set(`${mk}|${o.name.toLowerCase()}`, o.id);
  }

  // 3. Resolve markers → ids, then create one inquiry per row.
  function resolveVal(v: unknown): unknown {
    if (isCreateMarker(v)) {
      const mk = MASTER_KIND[v.__createMaster.kind];
      return mk
        ? idByKindName.get(`${mk}|${v.__createMaster.name.toLowerCase()}`)
        : undefined;
    }
    if (Array.isArray(v))
      return v.map(resolveVal).filter((x) => x !== undefined);
    return v;
  }

  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rows[i]!)) {
      const rv = resolveVal(v);
      if (rv !== null && rv !== undefined && rv !== "") input[k] = rv;
    }
    // createInquiry requires these — inject defaults when the sheet omitted them.
    if (input.priority === undefined) input.priority = "normal";
    if (input.currency === undefined) input.currency = "INR";
    if (input.country === undefined) input.country = "India";
    try {
      const res = await createInquiry(
        input as Parameters<typeof createInquiry>[0],
      );
      if (res.ok) created++;
      else errors.push({ row: i + 1, reason: res.error ?? "create failed" });
    } catch (e) {
      errors.push({
        row: i + 1,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: errors.length === 0, created, skipped: errors.length, newMasters, errors };
}
