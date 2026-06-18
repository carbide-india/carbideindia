/**
 * Seed the Item Master code-bearing masters: Size + Shape options (with their
 * short codes), the Condition codes, and the Internal Grade codes — all from
 * Carbide's "Item Master Logic" sheet. Idempotent (upsert by kind + lower(name);
 * updates the `code`). Run: npx tsx --env-file=.env.local scripts/seed-item-master-codes.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const GRADES = [
  "CIF06", "CIF10", "CIW06", "CIW10", "CIW11", "CIW14", "CIW15",
  "CIH06", "CIH10", "CIH11", "CIH14", "CIH15",
  "CID06", "CID10", "CID11", "CID14", "CID15", "CID25", "CIK20",
];

const DATA: { kind: string; name: string; code: string }[] = [
  // Size (first item-code segment)
  { kind: "size", name: "Small", code: "S" },
  { kind: "size", name: "Medium", code: "M" },
  { kind: "size", name: "Large", code: "L" },
  { kind: "size", name: "Small Assembly", code: "SA" },
  { kind: "size", name: "Medium Assembly", code: "MA" },
  { kind: "size", name: "Large Assembly", code: "LA" },
  { kind: "size", name: "Special", code: "Sp" },
  { kind: "size", name: "Assembly", code: "A" },
  { kind: "size", name: "Powder", code: "P" },
  // Shape
  { kind: "shape", name: "Cylinder - Reg", code: "C" },
  { kind: "shape", name: "H. Cylinder - Reg", code: "HC" },
  { kind: "shape", name: "Flat - Reg", code: "F" },
  { kind: "shape", name: "Cylinder - Spl", code: "CSp" },
  { kind: "shape", name: "H. Cylinder - Spl", code: "HCSp" },
  { kind: "shape", name: "Flat - Spl", code: "FSp" },
  // Condition codes
  { kind: "condition", name: "Sintered", code: "B" },
  { kind: "condition", name: "Finished", code: "Fi" },
  { kind: "condition", name: "Semi Finished", code: "SF" },
  { kind: "condition", name: "OD Ground", code: "ODG" },
  { kind: "condition", name: "Tumble", code: "T" },
  { kind: "condition", name: "Thickness Clean", code: "TC" },
  { kind: "condition", name: "OD & Thickness Clean", code: "ODT" },
  // Internal Grade (code = name)
  ...GRADES.map((g) => ({ kind: "internal_grade", name: g, code: g })),
];

async function main() {
  let i = 0;
  for (const d of DATA) {
    await sql`
      INSERT INTO master_options (kind, name, code, sort_order)
      VALUES (${d.kind}, ${d.name}, ${d.code}, ${100 + i})
      ON CONFLICT (kind, lower(name)) DO UPDATE SET code = EXCLUDED.code, is_active = true`;
    i++;
  }
  const counts = await sql`SELECT kind, count(*)::int AS n, count(code)::int AS coded
                           FROM master_options WHERE kind IN ('size','shape','condition','internal_grade')
                           GROUP BY kind ORDER BY kind`;
  console.log("Item-master masters now:");
  for (const c of counts) console.log(`  ${c.kind}: ${c.n} options, ${c.coded} with codes`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
