// Seed the reference/label defaults that used to live inside the old
// Supabase-era migration chain (squashed away in the Neon move).
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
// Deliberately NOT preserved (Altus-era master data): the clients roster
// (0022), the subjects roster (0025) and the department list (0023). Those are
// admin-managed lists the new org builds up itself via the UI.
//
// Idempotent: every statement is INSERT ... ON CONFLICT DO NOTHING, so
// re-running is safe and never clobbers admin edits.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

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

async function main(): Promise<void> {
  await seedStatusSettings();
  await seedOrgSettings();
  console.log("seed-defaults: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed-defaults failed:", err);
    process.exit(1);
  });
