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
import {
  MASTER_KINDS,
  PERMISSION_CATALOGUE,
  type MasterKind,
  type DocNumberStrategy,
} from "@/db/enums";
import type { NotificationKind } from "@/db/schema";
import { presetForShapeName } from "@/lib/masters/shape-config";
import { MESSAGE_TEMPLATE_SEEDS } from "@/lib/templates/seeds";
import { FEASIBILITY_DIMENSIONS } from "@/lib/feasibility/dimensions";

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
  department: [
    "New Product Development",
    "Sales",
    "Quotation",
    "Purchase",
    "Director",
    "Others",
  ],
  size: [
    "Small", "Medium", "Large",
    "Small Assembly", "Medium Assembly", "Large Assembly",
    "Special", "Assembly", "Powder",
  ],
  shape: [
    "Cylinder - Reg", "H. Cylinder - Reg", "Flat - Reg",
    "Cylinder - Spl", "H. Cylinder - Spl", "Flat - Spl",
  ],
  dispatch_condition: ["Sintered", "Green", "Soft", "HIP"],
  pressing_type: ["Manual", "Auto", "Isostatic", "Extrusion"],
  // Form 04/05 (migration 0062) — seeded EMPTY; Alok populates via Admin → Masters.
  external_grade: [],
  internal_production_code: [],
  part_no: [],
  // Costing Master engine v3 (migration 0064). tooling_chart ships EMPTY (Alok
  // fills the tool types); the other three are seeded per Manan's/Alok's sheet.
  tooling_chart: [], // data pending from Alok — admin adds via UI
  machining_op: [
    "OD",
    "Thickness",
    "ID",
    "Tumbling",
    "Angle on Surface",
    "Radius on Surface",
  ],
  quantity_tolerance: ["5% +/-", "10% +/-", "Exact"],
  payment_term: [
    "100% Advance",
    "50% Advance & 50% on Dispatch",
    "100% on Dispatch",
    "7 Days Credit",
    "10 Days Credit",
    "15 Days Credit",
    "30 Days Credit",
    "45 Days Credit",
    "60 Days Credit",
  ],
  tolerance: [
    "CID06",
    "CID06(CID07)",
    "CID08",
    "CID08(CIH08)",
    "CID10",
    "CID10 (CIH10)",
    "CID14",
    "CID14(CIH14)",
    "CID16",
    "CID20",
    "CID22",
    "CID25",
    "CID25(CIH25)",
    "CIF03",
    "CIF06",
    "CIF10",
    "CIF10R",
    "CIF10-RCY",
    "CIF10RSF",
    "CIF14R",
    "CIH06",
    "CIH06(CIH07)",
    "CIH06(SF)",
    "CIH08",
    "CIH10",
    "CIH10(SZ)",
    "CIH11",
    "CIH14",
    "CIH14(S)",
    "CIK05",
    "CIK20",
    "CIK-20",
    "CIK20(CIW06)",
    "CIM06",
    "CIUF06",
    "CIW03",
    "CIW06",
    "CIW06(BLZ)",
    "CIW06(CIH06)",
    "CIW06(SF)",
    "CIW08 Sp",
    "CIW09",
    "CIW10",
    "CIW11",
    "CIW11(CIH10)",
    "CIW11(CIH11)",
    "CIW12",
    "CIW14",
    "CIW15",
    "CIW15(CIW14)",
    "CIW16",
    "CIWB06",
    "CK05",
    "CK-05",
    "GT-15",
  ], // grades from Alokbhai's sheet (2026-06); internal_grade still pending
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

/**
 * Set the dimension-config preset on each Shape that has none yet (forms/
 * masters redesign — Phase B). Idempotent: only fills config IS NULL.
 */
async function seedShapeConfigs(): Promise<void> {
  const shapes = (await db.execute(sql`
    SELECT id, name FROM master_options WHERE kind = 'shape' AND config IS NULL
  `)) as unknown as { id: string; name: string }[];
  let n = 0;
  for (const s of shapes) {
    const preset = presetForShapeName(s.name);
    if (!preset) continue;
    await db.execute(sql`
      UPDATE master_options SET config = ${JSON.stringify(preset)}::jsonb WHERE id = ${s.id}
    `);
    n++;
  }
  console.log(`shape configs seeded: ${n}`);
}

// Roles (ERP redesign — Phase 1). The seven canonical pipeline actors. `admin`
// implies every role in the enforcement layer (lib/auth/roles.ts). Order here
// is the display sort_order (× 10).
const ROLE_SEEDS: { name: string; label: string }[] = [
  { name: "sales", label: "Sales" },
  { name: "costing", label: "Costing" },
  { name: "production", label: "Production" },
  { name: "qc", label: "QC" },
  { name: "dispatch", label: "Dispatch" },
  { name: "accounts", label: "Accounts" },
  { name: "admin", label: "Admin" },
];

/**
 * Upsert the 7 roles (idempotent by name — existing rows keep their label/order
 * untouched) and data-fill the `admin` role onto every active/is_admin employee
 * that doesn't already have it. Re-runnable: both steps are insert-if-missing.
 */
async function seedRoles(): Promise<void> {
  for (const [i, r] of ROLE_SEEDS.entries()) {
    await db.execute(sql`
      INSERT INTO roles (name, label, sort_order)
      VALUES (${r.name}, ${r.label}, ${(i + 1) * 10})
      ON CONFLICT (name) DO NOTHING
    `);
  }
  const roleRows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM roles`,
  )) as unknown as { n: number }[];
  console.log(`roles: seeded — ${roleRows[0]?.n ?? 0} rows present`);

  // Data-fill: grant the `admin` role to every admin employee lacking it. The
  // NOT EXISTS guard + the (employee_id, role_id) unique index make this a
  // no-op on re-run.
  await db.execute(sql`
    INSERT INTO employee_roles (employee_id, role_id)
    SELECT e.id, r.id
    FROM employees e
    CROSS JOIN roles r
    WHERE r.name = 'admin'
      AND e.is_admin = true
      AND e.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM employee_roles er
        WHERE er.employee_id = e.id AND er.role_id = r.id
      )
  `);
  const grantRows = (await db.execute(sql`
    SELECT count(*)::int AS n
    FROM employee_roles er
    JOIN roles r ON r.id = er.role_id
    WHERE r.name = 'admin'
  `)) as unknown as { n: number }[];
  console.log(`employee_roles[admin]: ${grantRows[0]?.n ?? 0} grant(s) present`);
}

async function seedFeasibilityDimensions(): Promise<void> {
  // Primary Feasibility v2 scorecard (migration 0056): the admin-editable
  // dimension catalogue, seeded from the code defaults. Idempotent on `key`, so
  // re-running never clobbers weight tuning done in the master.
  for (const d of FEASIBILITY_DIMENSIONS) {
    await db.execute(sql`
      INSERT INTO feasibility_dimensions (key, label, hint, weight, sort_order, is_active)
      VALUES (${d.key}, ${d.label}, ${d.hint}, ${String(d.defaultWeight)}, ${d.sortOrder}, true)
      ON CONFLICT (key) DO NOTHING
    `);
  }
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM feasibility_dimensions`,
  )) as unknown as { n: number }[];
  console.log(`feasibility_dimensions: seeded — ${rows[0]?.n ?? 0} rows present`);
}

/**
 * Permission catalogue (Admin Console — migration 0071). Seeded from the code
 * catalogue in db/enums.ts; idempotent on `key`, so re-running never clobbers a
 * label edit or a deactivation done in the admin UI. Grants (role_permissions)
 * are deliberately NOT seeded: `admin` short-circuits every check in
 * lib/auth/roles.ts, so a fresh DB behaves exactly as before until an admin
 * grants something.
 */
async function seedPermissions(): Promise<void> {
  for (const [i, p] of PERMISSION_CATALOGUE.entries()) {
    await db.execute(sql`
      INSERT INTO permissions (key, module, label, description, sort_order)
      VALUES (${p.key}, ${p.module}, ${p.label}, ${p.description}, ${(i + 1) * 10})
      ON CONFLICT (key) DO NOTHING
    `);
  }
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM permissions`,
  )) as unknown as { n: number }[];
  console.log(`permissions: seeded — ${rows[0]?.n ?? 0} rows present`);
}

// Document-number formats (Admin Console — migration 0071). One row per family
// the app actually numbers today, read off the codebase:
//   fy_series → lib/series/next-number.ts (SERIES_KEYS + SERIES_DEFAULTS)
//   sequence  → the pgSequence column DEFAULTs in db/schema.ts
//   sm_suffix → the `<SM>-Q01` derivations in the quotation/negotiation/SO/PI actions
const DOC_FORMAT_SEEDS: {
  seriesKey: string;
  label: string;
  module: string;
  strategy: DocNumberStrategy;
  prefix: string;
  padTo: number;
  includeFy: boolean;
  sequenceName: string | null;
}[] = [
  { seriesKey: "invoice", label: "Tax Invoice", module: "accounts", strategy: "fy_series", prefix: "INV", padTo: 4, includeFy: true, sequenceName: null },
  { seriesKey: "dn", label: "Delivery Note", module: "dispatch", strategy: "fy_series", prefix: "DN", padTo: 4, includeFy: true, sequenceName: null },
  { seriesKey: "credit_note", label: "Credit Note", module: "accounts", strategy: "fy_series", prefix: "CN", padTo: 4, includeFy: true, sequenceName: null },
  { seriesKey: "sm_number", label: "SM Number (Enquiry)", module: "sales", strategy: "sequence", prefix: "SM", padTo: 0, includeFy: false, sequenceName: "inquiries_sm_number_seq" },
  { seriesKey: "client_code", label: "Client Code", module: "masters", strategy: "sequence", prefix: "CL-", padTo: 4, includeFy: false, sequenceName: "clients_client_code_seq" },
  { seriesKey: "vendor_code", label: "Vendor Code", module: "masters", strategy: "sequence", prefix: "VN-", padTo: 4, includeFy: false, sequenceName: "vendors_vendor_code_seq" },
  { seriesKey: "item_code", label: "Item Code", module: "masters", strategy: "sequence", prefix: "", padTo: 0, includeFy: false, sequenceName: "item_seq_seq" },
  { seriesKey: "meeting_no", label: "Client Meeting", module: "sales", strategy: "sequence", prefix: "MTG", padTo: 0, includeFy: false, sequenceName: "client_meeting_no_seq" },
  { seriesKey: "production_order_no", label: "Production Order", module: "production", strategy: "sequence", prefix: "PO-", padTo: 0, includeFy: false, sequenceName: "production_order_no_seq" },
  { seriesKey: "task_no", label: "Task Number", module: "admin", strategy: "sequence", prefix: "#", padTo: 0, includeFy: false, sequenceName: "tasks_task_no_seq" },
  { seriesKey: "quotation", label: "Quotation", module: "sales", strategy: "sm_suffix", prefix: "Q", padTo: 2, includeFy: false, sequenceName: null },
  { seriesKey: "negotiation", label: "Negotiation", module: "sales", strategy: "sm_suffix", prefix: "N", padTo: 2, includeFy: false, sequenceName: null },
  { seriesKey: "sales_order", label: "Sales Order", module: "sales", strategy: "sm_suffix", prefix: "SO", padTo: 2, includeFy: false, sequenceName: null },
  { seriesKey: "proforma_invoice", label: "Proforma Invoice", module: "sales", strategy: "sm_suffix", prefix: "PI", padTo: 2, includeFy: false, sequenceName: null },
];

async function seedDocNumberFormats(): Promise<void> {
  for (const [i, f] of DOC_FORMAT_SEEDS.entries()) {
    await db.execute(sql`
      INSERT INTO doc_number_formats
        (series_key, label, module, strategy, prefix, pad_to, include_fy, sequence_name, sort_order)
      VALUES (
        ${f.seriesKey}, ${f.label}, ${f.module}, ${f.strategy}, ${f.prefix},
        ${f.padTo}, ${f.includeFy}, ${f.sequenceName}, ${(i + 1) * 10}
      )
      ON CONFLICT (series_key) DO NOTHING
    `);
  }
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM doc_number_formats`,
  )) as unknown as { n: number }[];
  console.log(`doc_number_formats: seeded — ${rows[0]?.n ?? 0} rows present`);
}

// GST slabs (Admin Console — migration 0071). Intra-state splits the rate 50/50
// into CGST + SGST; inter-state puts the whole rate on IGST (lib/gst/compute.ts).
// 18% is the default — Carbide India's carbide products sit in that slab.
const TAX_RATE_SEEDS: { label: string; rate: string; isDefault: boolean }[] = [
  { label: "GST 0%", rate: "0", isDefault: false },
  { label: "GST 5%", rate: "5", isDefault: false },
  { label: "GST 12%", rate: "12", isDefault: false },
  { label: "GST 18%", rate: "18", isDefault: true },
  { label: "GST 28%", rate: "28", isDefault: false },
];

async function seedTaxRates(): Promise<void> {
  for (const [i, t] of TAX_RATE_SEEDS.entries()) {
    const half = (Number(t.rate) / 2).toFixed(2);
    await db.execute(sql`
      INSERT INTO tax_rates
        (label, rate_percent, cgst_percent, sgst_percent, igst_percent, is_default, sort_order)
      VALUES (${t.label}, ${t.rate}, ${half}, ${half}, ${t.rate}, ${t.isDefault}, ${(i + 1) * 10})
      ON CONFLICT (label) DO NOTHING
    `);
  }
  // HSN defaults for the two headings Carbide India actually bills under.
  // Idempotent on `code`; the tax_rate_id lookup is a no-op if the slab is gone.
  await db.execute(sql`
    INSERT INTO hsn_codes (code, description, tax_rate_id, default_uom)
    SELECT v.code, v.descr, tr.id, v.uom
    FROM (VALUES
      ('8209', 'Plates, sticks, tips and the like for tools, unmounted, of cermets', 'Nos'),
      ('8207', 'Interchangeable tools for hand tools or machine-tools', 'Nos')
    ) AS v(code, descr, uom)
    LEFT JOIN tax_rates tr ON tr.label = 'GST 18%'
    ON CONFLICT (code) DO NOTHING
  `);
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM tax_rates) AS rates,
      (SELECT count(*)::int FROM hsn_codes) AS hsn
  `)) as unknown as { rates: number; hsn: number }[];
  console.log(
    `tax_rates: seeded — ${rows[0]?.rates ?? 0} rows; hsn_codes: ${rows[0]?.hsn ?? 0} rows`,
  );
}

// Currencies (Admin Console — migration 0071). INR is the base (rate 1.000000
// and is_base); the rest ship deactivated-rate placeholders an admin refreshes
// from Admin → Currency & Credit. Codes mirror the enquiry currency list.
const CURRENCY_SEEDS: { code: string; name: string; symbol: string; isBase: boolean }[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
  { code: "USD", name: "US Dollar", symbol: "$", isBase: false },
  { code: "EUR", name: "Euro", symbol: "€", isBase: false },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", isBase: false },
  { code: "AED", name: "UAE Dirham", symbol: "AED", isBase: false },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", isBase: false },
];

async function seedCurrencies(): Promise<void> {
  for (const [i, c] of CURRENCY_SEEDS.entries()) {
    await db.execute(sql`
      INSERT INTO currencies (code, name, symbol, exchange_rate_to_inr, is_base, sort_order)
      VALUES (${c.code}, ${c.name}, ${c.symbol}, ${c.isBase ? "1" : "0"}, ${c.isBase}, ${(i + 1) * 10})
      ON CONFLICT (code) DO NOTHING
    `);
  }
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM currencies`,
  )) as unknown as { n: number }[];
  console.log(`currencies: seeded — ${rows[0]?.n ?? 0} rows present`);
}

// Message templates (Admin Console — migration 0071). One email template per
// notification kind, seeded from the wording the react-email templates in
// emails/ already use. `{{token}}` placeholders are listed in `variables` so the
// editor can offer them. An inactive/absent row = fall back to the built-in
// template, so these seeds change no behaviour on their own.

async function seedMessageTemplates(): Promise<void> {
  // Every (kind, channel) slot, not email only — push and inbox previously fell
  // back to the built-in component forever because nothing was ever seeded.
  for (const t of MESSAGE_TEMPLATE_SEEDS) {
    await db.execute(sql`
      INSERT INTO message_templates (kind, channel, name, subject, body, variables)
      VALUES (
        ${t.kind}, ${t.channel}, ${t.name}, ${t.subject}, ${t.body},
        string_to_array(${t.variables.join(",")}, ',')
      )
      ON CONFLICT (kind, channel) DO NOTHING
    `);
  }
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS n FROM message_templates`,
  )) as unknown as { n: number }[];
  console.log(`message_templates: seeded — ${rows[0]?.n ?? 0} rows present`);
}

async function main(): Promise<void> {
  await seedStatusSettings();
  await seedOrgSettings();
  await seedMasterOptions();
  await seedShapeConfigs();
  await seedRoles();
  await seedFeasibilityDimensions();
  await seedPermissions();
  await seedDocNumberFormats();
  await seedTaxRates();
  await seedCurrencies();
  await seedMessageTemplates();
  console.log("seed-defaults: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed-defaults failed:", err);
    process.exit(1);
  });
