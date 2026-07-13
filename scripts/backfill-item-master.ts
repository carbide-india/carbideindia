/**
 * TOTAL Item-Master backfill (ERP redesign — Phase 4, §3.8).
 *
 * Replaces the old skip-logic backfill: it processes EVERY `inquiry_items` row
 * where `item_id IS NULL` through the SHARED Item-Sync Contract path
 * (`syncProductToItem`), so legacy and new rows get identical treatment:
 *   - complete spec        → active Item (dedup-reuse or create);
 *   - incomplete / unresolved shape → draft Item (draft:<lineId>);
 * then writes item_id back onto the line. Nothing is silently skipped.
 *
 * Legacy shape TEXT is resolved to a shape master via
 * `normalizeShapeName` → active shape master name, so historical free-text
 * ("cyl", "flat spl", ) maps to the canonical six before syncing. A line whose
 * shape can't be resolved (or is null) still produces a DRAFT (never skipped).
 *
 * READ-ONLY until the controller runs it. Idempotent (only touches item_id IS
 * NULL rows; re-runs dedup-reuse). Prints created / reused / draft / skipped.
 *
 * Run:  npx tsx --env-file=.env.local scripts/backfill-item-master.ts --apply
 * Dry:  npx tsx --env-file=.env.local scripts/backfill-item-master.ts          (default)
 *
 * NOTE: default is DRY. Pass --apply to write. This is a data op the controller
 * runs after human go — do not run it as part of the build gate.
 */
import Module from "node:module";
import { and, eq, isNull, sql as dsql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, masterOptions } from "@/db/schema";
import type { ItemSpec } from "@/lib/item-master/sync";
import { normalizeShapeName } from "@/lib/masters/shape-normalize";

// This maintenance script pulls in the server-side Item-Sync module, which (like
// the rest of lib/) declares `import "server-only"` — that throws when required
// outside an RSC/server-action context. Stub it (and client-only) at the module
// loader so the shared sync path can be reused here, then dynamic-import sync.
type ModLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
const _mod = Module as unknown as { _load: ModLoad };
const _origLoad = _mod._load;
_mod._load = ((request: string, parent: unknown, isMain: boolean) =>
  request === "server-only" || request === "client-only"
    ? {}
    : _origLoad(request, parent, isMain)) as ModLoad;

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

const toNum = (v: string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const { syncProductToItem, missingRequiredDims } = await import("@/lib/item-master/sync");

  // Build shape-name → shapeId map once (active shape masters).
  const shapeMasters = await db
    .select({ id: masterOptions.id, name: masterOptions.name })
    .from(masterOptions)
    .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.isActive, true)));
  const shapeIdByName = new Map<string, string>();
  for (const s of shapeMasters) shapeIdByName.set(s.name.trim().toLowerCase(), s.id);

  /** Resolve a legacy shape TEXT → active shape master id via normalizeShapeName. */
  const resolveShapeId = (shapeText: string | null): string | null => {
    if (!shapeText) return null;
    // Exact active-master match first (already-canonical rows).
    const exact = shapeIdByName.get(shapeText.trim().toLowerCase());
    if (exact) return exact;
    const canon = normalizeShapeName(shapeText);
    if (!canon) return null;
    return shapeIdByName.get(canon.trim().toLowerCase()) ?? null;
  };

  const rows = await db
    .select({
      id: inquiryItems.id,
      smNumber: inquiries.smNumber,
      custProductName: inquiryItems.custProductName,
      shape: inquiryItems.shape,
      gradeId: inquiryItems.gradeId,
      gradeCustomer: inquiryItems.gradeCustomer,
      toleranceId: inquiryItems.toleranceId,
      conditionId: inquiryItems.conditionId,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionNotes: inquiryItems.dimensionNotes,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
    .where(isNull(inquiryItems.itemId));

  let created = 0, reused = 0, draft = 0, skipped = 0;

  for (const r of rows) {
    const label = `${r.smNumber} "${r.custProductName ?? "-"}"`;
    const shapeId = resolveShapeId(r.shape);
    const spec: ItemSpec = {
      shapeId,
      internalGradeId: r.gradeId,
      toleranceId: r.toleranceId,
      conditionId: r.conditionId,
      gradeCustomer: r.gradeCustomer,
      outerDia: toNum(r.outerDia), innerDia: toNum(r.innerDia),
      length: toNum(r.length), width: toNum(r.width), thickness: toNum(r.thickness),
      dimensionNotes: r.dimensionNotes,
    };

    if (DRY) {
      // Classify without writing: emulate the contract's active/draft decision.
      const missing = await missingRequiredDims(db, spec);
      if (missing.length) {
        console.log(`WOULD DRAFT ${label} (missing:${missing.join(",")})`);
        draft++;
      } else {
        console.log(`WOULD SYNC  ${label} (shape ${r.shape ?? "-"})`);
        created++;
      }
      continue;
    }

    try {
      const res = await db.transaction(async (tx) => {
        const sync = await syncProductToItem(tx, spec, r.id);
        await tx.update(inquiryItems).set({ itemId: sync.itemId, updatedAt: new Date() }).where(eq(inquiryItems.id, r.id));
        return sync;
      });
      if (res.status === "draft") {
        console.log(`DRAFT  ${label}: ${res.itemCode} (missing:${res.missing.join(",")})`);
        draft++;
      } else if (res.reused) {
        console.log(`LINK   ${label}: reused ${res.itemCode}`);
        reused++;
      } else {
        console.log(`CREATE ${label}: ${res.itemCode}`);
        created++;
      }
    } catch (err) {
      console.error(`SKIP   ${label}: error`, err);
      skipped++;
    }
  }

  // Residual check (informational in this script; the NOT-NULL migration is the
  // hard gate applied separately after this backfill).
  const remainingRows = (await db.execute(
    dsql`SELECT count(*)::int AS remaining FROM inquiry_items WHERE item_id IS NULL`,
  )) as unknown as { remaining: number }[];
  const remaining = remainingRows[0]?.remaining ?? 0;

  console.log(
    `\n${DRY ? "[dry-run] " : ""}done. created=${created} reused=${reused} draft=${draft} skipped=${skipped} | inquiry_items with null item_id remaining: ${remaining}`,
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
