/**
 * One-time backfill: generate Item Master items for enquiry products created
 * before auto-registration existed (and never manually generated). Mirrors
 * `generateItemForInquiryItem` (field mapping) + `createItem` (dedup, code
 * assembly, insert) using the SAME pure helpers so codes match the app exactly.
 * Skips products with no shape master or a missing shape-required dimension.
 *
 * Run:  npx tsx --env-file=.env.local scripts/backfill-item-master.ts
 * Dry:  npx tsx --env-file=.env.local scripts/backfill-item-master.ts --dry
 */
import { and, eq, inArray, isNotNull, isNull, sql as dsql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, items, masterOptions } from "@/db/schema";
import { itemDedupKey } from "@/lib/item-master/dedup";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";
import { resolveShapeConfig, requiredDims, DIM_LABELS } from "@/lib/masters/shape-config";

const DRY = process.argv.includes("--dry");
const toNum = (v: string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (n: number | null): string | null => (n != null ? String(n) : null);

async function main() {
  const rows = await db
    .select({
      id: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      createdById: inquiries.createdById,
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      drawingRevisionNo: inquiryItems.drawingRevisionNo,
      quantityNos: inquiryItems.quantityNos,
      shape: inquiryItems.shape,
      gradeId: inquiryItems.gradeId,
      toleranceId: inquiryItems.toleranceId,
      conditionId: inquiryItems.conditionId,
      gradeCustomer: inquiryItems.gradeCustomer,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionNotes: inquiryItems.dimensionNotes,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
    .where(and(isNull(inquiryItems.itemId), isNotNull(inquiryItems.shape)));

  let created = 0, reused = 0, skipped = 0;

  for (const r of rows) {
    const label = `${r.smNumber} "${r.custProductName ?? "-"}"`;
    if (!r.shape) { skipped++; continue; }

    const [shapeRow] = await db
      .select({ id: masterOptions.id, config: masterOptions.config })
      .from(masterOptions)
      .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.name, r.shape)))
      .limit(1);
    if (!shapeRow) { console.log(`SKIP ${label}: shape "${r.shape}" is not a master option`); skipped++; continue; }
    const shapeId = shapeRow.id;

    const dims = {
      outerDia: toNum(r.outerDia), innerDia: toNum(r.innerDia),
      length: toNum(r.length), width: toNum(r.width), thickness: toNum(r.thickness),
    };
    const cfg = resolveShapeConfig(shapeRow.config);
    const missing = requiredDims(cfg).filter((f) => dims[f] == null);
    if (missing.length > 0) {
      console.log(`SKIP ${label}: missing required dim(s) ${missing.map((f) => DIM_LABELS[f]).join(", ")}`);
      skipped++; continue;
    }

    const dedupKey = itemDedupKey({
      shapeId, internalGradeId: r.gradeId, conditionId: r.conditionId, toleranceId: r.toleranceId, ...dims,
    });

    const [existing] = await db
      .select({ id: items.id, itemCode: items.itemCode })
      .from(items)
      .where(eq(items.dedupKey, dedupKey))
      .limit(1);
    if (existing) {
      if (!DRY) await db.update(inquiryItems).set({ itemId: existing.id, updatedAt: new Date() }).where(eq(inquiryItems.id, r.id));
      console.log(`LINK ${label}: reused ${existing.itemCode}`);
      reused++; continue;
    }

    const refIds = [shapeId, r.gradeId, r.conditionId, r.toleranceId].filter((x): x is string => Boolean(x));
    const codeById = new Map<string, { name: string; code: string | null }>();
    if (refIds.length) {
      const mrows = await db
        .select({ id: masterOptions.id, name: masterOptions.name, code: masterOptions.code })
        .from(masterOptions)
        .where(inArray(masterOptions.id, refIds));
      for (const m of mrows) codeById.set(m.id, { name: m.name, code: m.code });
    }
    const codeOf = (id?: string | null) => (id ? (codeById.get(id)?.code ?? codeById.get(id)?.name ?? "") : "");

    const dimList = [dims.outerDia, dims.innerDia, dims.length, dims.width, dims.thickness].filter((d): d is number => d !== null);
    const sizeCode = dimList.length ? deriveSizeCode(dimList) : "";

    if (DRY) { console.log(`WOULD CREATE ${label} (shape ${r.shape})`); created++; continue; }

    const seqRows = (await db.execute(dsql`SELECT nextval('item_seq_seq')::int AS seq`)) as unknown as { seq: number }[];
    const seq = Number(seqRows[0]?.seq ?? 0);
    const itemCode = buildItemCode({
      sizeCode: sizeCode || "X", seq,
      shapeCode: codeOf(shapeId), gradeCode: codeOf(r.gradeId),
      conditionCode: codeOf(r.conditionId), toleranceCode: codeOf(r.toleranceId), dims: dimList,
    });

    const [ins] = await db
      .insert(items)
      .values({
        seq, itemCode, dedupKey,
        inquiryId: r.inquiryId, smNumber: r.smNumber,
        customerName: r.companyName, custProductName: r.custProductName,
        custDrawingNo: r.custDrawingNo, drawingRevisionNo: r.drawingRevisionNo,
        qty: r.quantityNos, sizeCode: sizeCode || null,
        shapeId, internalGradeId: r.gradeId, toleranceId: r.toleranceId, conditionId: r.conditionId,
        gradeCustomer: r.gradeCustomer,
        outerDia: strOrNull(dims.outerDia), innerDia: strOrNull(dims.innerDia),
        length: strOrNull(dims.length), width: strOrNull(dims.width), thickness: strOrNull(dims.thickness),
        dimensionNotes: r.dimensionNotes, uom: "Nos", createdById: r.createdById,
      })
      .onConflictDoNothing({ target: items.dedupKey })
      .returning({ id: items.id, itemCode: items.itemCode });

    if (!ins) { console.log(`SKIP ${label}: dedup race, already exists`); skipped++; continue; }
    await db.update(inquiryItems).set({ itemId: ins.id, updatedAt: new Date() }).where(eq(inquiryItems.id, r.id));
    console.log(`CREATE ${label}: ${ins.itemCode}`);
    created++;
  }

  console.log(`\n${DRY ? "[dry-run] " : ""}done. created=${created} reused=${reused} skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
