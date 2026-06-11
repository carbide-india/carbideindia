// Seed the reference/label defaults that used to live inside the old
// pre-Neon migration chain (squashed away in the Neon move).
//
// Run AFTER `pnpm db:migrate` on a fresh database:
//   pnpm seed:defaults
//
// Preserved from the old migrations:
//   - status_settings rows (0016 + 0021 + 0024 + 0034 + 0046): one display row
//     per task_status enum value with Manan's canonical labels, colour tokens
//     and display order. The admin Statuses tab UPDATEs these rows in place —
//     without the seed, edits silently affect 0 rows. Deprecated statuses
//     (follow_up_1/2/3, need_help, cancelled, transferred) are seeded too: the
//     enum keeps their values, and any imported row carrying one still needs a
//     label + colour to render.
//   - org_settings singleton (0011 + 0044): the id=1 row every reader assumes
//     exists, with the trimmed notification matrix (email only for
//     task_assigned + overdue_digest; everything else inbox-only) so a fresh
//     install doesn't fall back to all-channels-for-everything.
//
// Deliberately NOT preserved (legacy-era master data): the clients roster
// (0022), the subjects roster (0025) and the department list (0023). Those are
// admin-managed lists the new org builds up itself via the UI.
//
// Idempotent: every statement is INSERT ... ON CONFLICT DO NOTHING, so
// re-running is safe and never clobbers admin edits.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { MASTER_KINDS, type MasterKind } from "@/db/enums";

async function seedStatusSettings(): Promise<void> {
  await db.execute(sql`
    INSERT INTO status_settings (status, label, color_token, display_order) VALUES
      ('dont_know',    'Not Read',     'stone',  5),
      ('not_started',  'Not Started',  'blue',   10),
      ('initiated',    'Initiated',    'yellow', 20),
      ('on_hold',      'On Hold',      'slate',  26),
      ('follow_up',    'Follow Up',    'orange', 30),
      ('follow_up_1',  'Follow Up 1',  'orange', 32),
      ('follow_up_2',  'Follow Up 2',  'orange', 34),
      ('follow_up_3',  'Follow Up 3',  'orange', 36),
      ('need_help',    'Need Help',    'red',    40),
      ('need_info',    'Need Info',    'red',    45),
      ('done',         'Done',         'green',  50),
      ('approved',     'Approved',     'purple', 60),
      ('not_approved', 'Not Approved', 'rose',   70),
      ('cancelled',    'Cancelled',    'slate',  80),
      ('transferred',  'Transferred',  'brown',  90)
    ON CONFLICT (status) DO NOTHING
  `);
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM status_settings`,
  )) as unknown as { n: number }[];
  console.log(`status_settings: seeded — ${rows[0]?.n ?? 0} rows present`);
}

async function seedOrgSettings(): Promise<void> {
  // Singleton row (id = 1, CHECK-enforced). Column defaults from db/schema.ts
  // cover everything except notification_matrix, whose schema default is {}
  // (= all channels for every kind at the resolver). Seed the trimmed matrix
  // from migration 0044 instead: email only for task_assigned + overdue_digest.
  await db.execute(sql`
    INSERT INTO org_settings (id, notification_matrix) VALUES (1, '{
      "task_assigned":  ["email"],
      "task_initiated": [],
      "status_changed": [],
      "approved":       [],
      "declined":       [],
      "reassigned":     [],
      "transferred":    [],
      "cancelled":      [],
      "commented":      [],
      "overdue_digest": ["email"]
    }'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("org_settings: singleton row (id = 1) ensured");
}

// Phase 2 masters (sheet from Manan, 2026-06). Internal Grade and Tolerance
// ship empty — data pending from Alokbhai; admins add rows via the UI.
const MASTER_SEEDS: Record<MasterKind, string[]> = {
  customer_type: ["End User", "Traders", "OEMs", "Contract Manufacturer"],
  industry_type: [
    "Mining",
    "Pharma",
    "Petrochem",
    "Wire Ind.",
    "Tool Manufacturers",
    "Defence",
    "Others",
  ],
  product_type: [
    "Mining Inserts General",
    "Mining Inserts Tricone",
    "Mining Inserts DTH",
    "Mining Inserts Crossbit",
    "VSI Flats",
    "WDP Wire Drawing Pallets",
    "Cold Heading Pallets",
    "Bushes General",
    "Bushes for Guages",
    "Flats General",
    "Flats for Guages",
    "Roller General",
    "Roller for Flattening Mill",
    "Roller for Wire Ind.",
    "Burr Blanks",
    "Dies Pharma",
    "Cones for Petroleum",
    "Chokebins for Petroleum",
    "Others",
  ],
  condition: [
    "Finished",
    "OD & Thickness Clean",
    "OD Ground",
    "Semi Finished",
    "Sintered",
    "Thickness Clean",
    "Tumble",
  ],
  internal_grade: [], // data pending from Alokbhai — admin adds via UI
  tolerance: [], // data pending from Alokbhai — admin adds via UI
};

async function seedMasterOptions(): Promise<void> {
  for (const kind of MASTER_KINDS) {
    const names = MASTER_SEEDS[kind];
    for (const [i, name] of names.entries()) {
      // Conflict target infers the (kind, lower(name)) expression unique
      // index `master_options_kind_name_uidx` — re-runs are no-ops.
      await db.execute(sql`
        INSERT INTO master_options (kind, name, sort_order)
        VALUES (${kind}::master_kind, ${name}, ${(i + 1) * 10})
        ON CONFLICT (kind, lower(name)) DO NOTHING
      `);
    }
  }
  const rows = (await db.execute(sql`
    SELECT kind::text AS kind, count(*)::int AS n
    FROM master_options
    GROUP BY kind
    ORDER BY kind
  `)) as unknown as { kind: string; n: number }[];
  const byKind = new Map(rows.map((r) => [r.kind, r.n]));
  for (const kind of MASTER_KINDS) {
    console.log(`master_options[${kind}]: ${byKind.get(kind) ?? 0} rows present`);
  }
}

async function main(): Promise<void> {
  await seedStatusSettings();
  await seedOrgSettings();
  await seedMasterOptions();
  console.log("seed-defaults: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed-defaults failed:", err);
    process.exit(1);
  });
