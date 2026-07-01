/**
 * ssot-lint — the single-source-of-truth read gate (ERP redesign, Phase 0).
 *
 *   npx tsx scripts/ci/ssot-lint.ts        (wired as `pnpm ssot-lint`)
 *
 * WHAT IT DOES
 * ------------
 * Scans application source (`components/`, `lib/queries/`, `app/`) for READS of
 * deprecated denormalized / snapshot spec columns that should instead be
 * resolved via a join to `items` (or `costings`). Prints every offending
 * `file:line` and exits non-zero on any hit.
 *
 * WHY IT STARTS EMPTY (Phase 0)
 * -----------------------------
 * This is the FOUNDATION only — it must be GREEN on today's codebase. The real
 * teeth land in later phases, which append rules to `DENIED_READS`:
 *
 *   - Phase 5 (read-through conversion): forbid reads of the denormalized spec
 *     mirrors (`items.customerName`, `items.smNumber`, `items.qty`, the always-
 *     copied `cust_product_name` / `grade` / `tolerance` on line tables, etc.)
 *     in DISPLAY / query contexts once every read has been converted to a join.
 *   - Phase 6 (snapshot law): forbid reads of the ~14 drifted snapshot mirrors
 *     that get dropped, plus reads of `origin_*` for usage/dedup/search.
 *
 * Each rule carries an `allow` list of substrings; a match whose file path
 * contains any allow-substring is exempt (e.g. the migration/backfill that is
 * the legitimate sole writer, or a snapshot-freeze transition handler).
 *
 * See `docs/glossary.md` (frozen names) and
 * `docs/2026-07-01-carbide-erp-redesign-architecture.md` §2 for the full list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

interface DeniedRead {
  /** Regex matched line-by-line against source. Use word boundaries / property access anchors. */
  pattern: RegExp;
  /** Human reason printed on a hit — say WHAT to use instead. */
  reason: string;
  /** File-path substrings exempt from this rule (legit sole-writer / snapshot handler). */
  allow: string[];
}

/**
 * The denylist — WITH TEETH as of Phase 5 (read-through conversion).
 *
 * Rules target SCHEMA-QUALIFIED column reads (`table.column`) rather than DTO
 * property access (`row.column`). This is deliberate: the read-through law is
 * enforced at the SELECT site (the query layer must not pull a spec/mirror
 * column off a line/parent table), while resolved DTO fields flowing into
 * components stay legal because they are now fed by JOINs to `items`. Anchoring
 * on `<table>.<column>` therefore has zero false-positives on the many DTO
 * fields that happen to share a mirror column's name.
 *
 * SNAPSHOT vs MIRROR: the LEGAL commercial snapshots (§2.4 — sent-quote /
 * confirmed-SO `unit_price`, `spec_snapshot`, JC `qty_ordered`) are NOT denied;
 * they govern sent/confirmed stages. Only the always-copied SPEC MIRRORS switch
 * to read-through. Where a mirror is still the legitimate write-path buffer or
 * the display-once provenance source, the offending file is allowlisted.
 */
const DENIED_READS: DeniedRead[] = [
  // ── The item-spine SPEC mirrors on commercial line tables (§2.5 REMOVE). ──
  // These are always-copied product-describing columns; spec now reads through
  // `items` via `item_id` (lib/flow/spec-resolve.ts). Prices/qty/timeline are
  // NOT here — they are the line's own transactional facts and stay.
  {
    pattern:
      /\bquotationItems\.(custProductName|custDrawingNo|drawingRevisionNo|gradeCustomer|gradeNameForCust|tolerance|condition|partNo|shape|outerDia|innerDia|length|width|thickness|dimensionNotes)\b/,
    reason:
      "quotation_items spec mirror is deprecated — resolve product spec via items (lib/flow/spec-resolve.ts) + customer-ask via the provenance inquiry_item.",
    allow: [
      // The write/seed path legitimately sets these mirror columns on insert.
      "app/(app)/quotations/actions.ts",
      "lib/validators/",
    ],
  },
  {
    pattern: /\bnegotiationItems\.(custProductName|partNo)\b/,
    reason:
      "negotiation_items spec mirror is deprecated — resolve via items (spec-resolve) + provenance inquiry_item for the customer product name.",
    allow: ["app/(app)/negotiations/actions.ts", "lib/validators/"],
  },
  {
    pattern: /\bsalesOrderItems\.(custProductName|partNo)\b/,
    reason:
      "sales_order_items spec mirror is deprecated — resolve via items (spec-resolve) + provenance inquiry_item for the customer product name.",
    allow: ["app/(app)/sales-orders/actions.ts", "lib/validators/"],
  },
  // ── inquiry_items RAW-ENTRY shape buffer must not be read for DISPLAY. ──
  // It is the pre-item buffer; the sync/create actions read it to MINT the
  // Item, and only those are allowlisted. Display resolves items.shapeId → name.
  {
    pattern: /\binquiryItems\.shape\b/,
    reason:
      "inquiry_items.shape is the pre-item raw buffer — display must read-through the linked item's shape master (getInquiryItems). Only the item-sync writers may read it.",
    allow: [
      "app/(app)/inquiries/actions.ts",
      "lib/item-master/",
    ],
  },
  // ── job_cards customer/product/grade snapshots (§2.5 REMOVE). ──
  // Read-through: customer via client_id, product code + grade via item_id.
  {
    pattern: /\bjobCards\.(customerName|productCode|gradeName)\b/,
    reason:
      "job_cards customer/product/grade mirror is deprecated for display — resolve customerName via clients, productCode/gradeName via the linked item (listJobCards). Write-path actions may still set them.",
    allow: ["app/(app)/job-cards/actions.ts", "lib/validators/"],
  },
  // ── items provenance mirrors renamed to origin_* (§2.2). ──
  // The legacy customer_name / sm_number / qty columns on `items` are drifted
  // provenance mirrors. Read the write-once origin_* columns for display-once
  // instead; never query any of them for usage/dedup/search. The item EDIT
  // rehydration + creation write-path legitimately touch the legacy columns.
  {
    pattern: /\bitems\.(customerName|smNumber|qty)\b/,
    reason:
      "items.customerName/smNumber/qty are drifted provenance mirrors — read the write-once origin_* columns for display-once (never for usage/dedup/search).",
    allow: [
      // Item create/edit form rehydration + writer own these legacy columns.
      "app/(app)/items/actions.ts",
      "lib/queries/items.ts",
      "lib/validators/",
    ],
  },
  // ── origin_* is display-only: never in a WHERE/search/dedup predicate. ──
  // We cannot cheaply distinguish a SELECT-for-display from a WHERE-clause read
  // syntactically, so the origin_* columns are simply confined to a small set
  // of legitimate display-once surfaces (item register/detail/export, the JC
  // product-picker context column, the command-palette label). Any NEW read of
  // origin_* outside these must be justified and added here.
  {
    pattern:
      /\bitems\.(originCustomerName|originSmNumber|originCustProductName|originQty|originEnquiryDate|originInquiryId)\b/,
    reason:
      "origin_* columns are write-once & display-only — never query them for usage/dedup/search (Canonical Decisions). New display-once sites must be allowlisted here.",
    allow: [
      "lib/queries/items.ts", // item register (listItems) display
      "lib/queries/job-cards.ts", // JC product-picker provenance context
      "lib/queries/command-search.ts", // palette display label only (searched by item_code)
      "app/(app)/items/export.xlsx/route.ts", // Excel export display-once
    ],
  },
];

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["components", "lib/queries", "app"];
const EXTS = new Set([".ts", ".tsx"]);
const IGNORE_DIR = new Set(["node_modules", ".next", "dist", ".turbo"]);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir may not exist (e.g. no lib/queries yet) — skip silently
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORE_DIR.has(name)) continue;
      walk(full, out);
    } else if (EXTS.has(name.slice(name.lastIndexOf(".")))) {
      out.push(full);
    }
  }
}

interface Hit {
  file: string;
  line: number;
  col: number;
  reason: string;
  snippet: string;
}

function main(): void {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const hits: Hit[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join("/");
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const rule of DENIED_READS) {
      if (rule.allow.some((a) => rel.includes(a))) continue;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const m = rule.pattern.exec(line);
        if (m) {
          hits.push({
            file: rel,
            line: i + 1,
            col: (m.index ?? 0) + 1,
            reason: rule.reason,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  if (hits.length === 0) {
    console.log(
      `ssot-lint: OK — scanned ${files.length} file(s) in [${SCAN_DIRS.join(", ")}], ${DENIED_READS.length} rule(s), 0 violations.`,
    );
    process.exit(0);
  }

  console.error(`ssot-lint: FAILED — ${hits.length} violation(s):\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}:${h.col}`);
    console.error(`    ${h.snippet}`);
    console.error(`    → ${h.reason}\n`);
  }
  process.exit(1);
}

main();
