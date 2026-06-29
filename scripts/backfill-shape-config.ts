// Backfill the per-shape dimension config (forms/masters redesign — Phase B).
// Sets the geometry-family preset (Cylinder = OD+Length, H.Cylinder = OD+ID+
// Length, Flat = L+W+Thickness) onto each `shape` master_option that has no
// config yet. Idempotent: only fills rows where config IS NULL; shapes with no
// known family (e.g. "Special") are left null (= all-optional default).
//
//   npx tsx --env-file=.env.local scripts/backfill-shape-config.ts
//
import postgres from "postgres";
import { presetForShapeName } from "../lib/masters/shape-config";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const shapes = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM master_options
    WHERE kind = 'shape' AND config IS NULL
  `;
  let updated = 0;
  let skipped = 0;
  for (const s of shapes) {
    const preset = presetForShapeName(s.name);
    if (!preset) {
      skipped++;
      continue;
    }
    await sql`UPDATE master_options SET config = ${JSON.stringify(preset)}::jsonb WHERE id = ${s.id}`;
    updated++;
    console.log(`  ${s.name} → ${JSON.stringify(preset.dims)}`);
  }
  console.log(`backfill complete: ${updated} shape(s) set, ${skipped} left default.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
