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
 * The denylist. EMPTY-BY-DESIGN in Phase 0 apart from the two examples below,
 * both of which target symbols that do NOT exist in the codebase today, so the
 * gate is green now and gains teeth as later phases add rules + remove the
 * grace exemptions.
 */
const DENIED_READS: DeniedRead[] = [
  {
    // Example rule (Phase-0 placeholder): a to-be-removed legacy helper. No
    // such import exists today, so this is green; Phase 5 will point real rules
    // at the denormalized spec mirrors it once fed.
    pattern: /from\s+["']@\/lib\/legacy\/denormalized-spec["']/,
    reason:
      "Do not import the deprecated denormalized-spec helper — resolve product spec via a join to `items` (see docs/glossary.md).",
    allow: [],
  },
  {
    // Example rule (Phase-0 placeholder): direct read of a provenance mirror.
    // `origin_*` columns are write-once/display-only and must never be queried
    // for usage/dedup/search. Anchored to `.originSmNumber` property access,
    // which is absent today (column not yet renamed) → green now.
    pattern: /\.originSmNumber\b/,
    reason:
      "`origin_*` columns are write-once & display-only — never query them for usage/dedup/search (Canonical Decisions).",
    allow: [],
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
