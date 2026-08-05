import "server-only";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { docNumberFormats, docNumberSeries, inquiries } from "@/db/schema";
import type { DocNumberStrategy } from "@/db/enums";
import {
  compareFinancialYears,
  financialYear,
  mintedBy,
  nextFinancialYear,
  prefixIsEditable,
  previewNumber,
} from "@/lib/numbering/render";

/**
 * Read model for Admin → Document Numbering.
 *
 * `doc_number_formats` is the CONFIG register (one row per document family,
 * seeded by scripts/seed-defaults.ts). The live counter lives elsewhere and
 * depends on the strategy:
 *   fy_series → a `doc_number_series` row per financial year, created lazily on
 *               the first allocation, so a family can legitimately have none.
 *   sequence  → a Postgres SEQUENCE (`last_value` + `is_called`).
 *   sm_suffix → no counter at all; the number is derived from the parent SM
 *               number at insert time, so we only ever preview it.
 */

/** Fallback SM number for the sm_suffix preview on a database with no enquiries. */
const FALLBACK_SM_NUMBER = "SM9579";

/** Guard for identifiers we interpolate into raw SQL (belt AND braces). */
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

export interface FyCounter {
  fyLabel: string;
  /** Prefix/padding as stored ON THE COUNTER ROW — this is what mints numbers. */
  prefix: string;
  padTo: number;
  lastValue: number;
  /** The value the next allocation will take (lastValue + 1). */
  nextValue: number;
  /** That value rendered exactly as lib/series/next-number.ts would render it. */
  nextFormatted: string;
  isCurrentFy: boolean;
  /** True when the counter row's prefix/padding drifted from the format row. */
  driftsFromFormat: boolean;
  updatedAt: Date;
}

export interface SequenceState {
  sequenceName: string;
  /** False when the format row names a sequence that no longer exists. */
  exists: boolean;
  lastValue: number | null;
  isCalled: boolean;
  /** The raw integer the next nextval() will hand out. */
  nextValue: number | null;
}

export interface NumberingFamily {
  id: string;
  seriesKey: string;
  label: string;
  module: string;
  strategy: DocNumberStrategy;
  prefix: string;
  separator: string;
  padTo: number;
  includeFy: boolean;
  sequenceName: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: Date;
  /** Per-financial-year counters, oldest first. fy_series only; else []. */
  counters: FyCounter[];
  /** Live sequence state. `sequence` strategy only; else null. */
  sequence: SequenceState | null;
  /** Documents issued under this family so far. Null when not countable. */
  issuedCount: number | null;
  /** The next number, rendered exactly as the app would render it. */
  nextPreview: string;
  /** Where the number is actually minted — surfaced next to every row. */
  source: string;
  /** True only for fy_series: editing prefix/padding genuinely takes effect. */
  canEditFormat: boolean;
}

/** A `doc_number_series` counter with no matching `doc_number_formats` row. */
export interface OrphanCounter {
  seriesKey: string;
  fyLabel: string;
  prefix: string;
  padTo: number;
  lastValue: number;
  nextFormatted: string;
}

/** A numbering scheme that exists in code but has no format row yet. */
export interface DetectedFamily {
  seriesKey: string;
  label: string;
  module: string;
  strategy: DocNumberStrategy;
  prefix: string;
  padTo: number;
  /** File that mints it — shown so an admin can verify the claim. */
  source: string;
}

/**
 * Numbering schemes found in the codebase that scripts/seed-defaults.ts does
 * NOT seed a `doc_number_formats` row for. Registering one adds the register
 * row (display/config only — the minting code is unchanged), which is what
 * makes the page a complete inventory rather than a partial one.
 *
 * Deliberately excluded: `job_cards.job_card_no` (user-entered, not
 * auto-generated) and `tasks.short_id` (a UUID slice, not a counter — and its
 * unique index `tasks_short_id_uidx` is string-matched by retry logic, so it is
 * never touched from here).
 */
export const DETECTED_FAMILIES: readonly DetectedFamily[] = [
  {
    seriesKey: "sample_no",
    label: "Sample Number",
    module: "sales",
    strategy: "sm_suffix",
    prefix: "",
    padTo: 2,
    source: "app/(app)/samples/actions.ts",
  },
];

export interface NumberingOverview {
  /** False when migration 0071 has not been applied yet. */
  schemaReady: boolean;
  families: NumberingFamily[];
  orphanCounters: OrphanCounter[];
  /** Detected-in-code families with no format row (registerable). */
  unregistered: DetectedFamily[];
  currentFy: string;
  /** The FY after `currentFy` — the only other year a counter may be opened for. */
  nextFy: string | null;
  sampleSmNumber: string;
  totals: {
    families: number;
    active: number;
    fyRegisters: number;
    liveSequences: number;
    issued: number;
  };
}

/** Row counts per series key, used for the "issued" column. */
const ISSUED_COUNT_TABLES: Record<string, string> = {
  invoice: "invoices",
  dn: "dispatches",
  credit_note: "credit_notes",
  sm_number: "inquiries",
  client_code: "clients",
  vendor_code: "vendors",
  item_code: "items",
  meeting_no: "client_meetings",
  production_order_no: "production_orders",
  task_no: "tasks",
  quotation: "quotations",
  negotiation: "negotiations",
  sales_order: "sales_orders",
  proforma_invoice: "proforma_invoices",
  sample_no: "samples",
};

/** Is this a "relation does not exist" error (migration not applied yet)? */
function isMissingRelation(err: unknown, relation: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(relation) && /does not exist/i.test(msg);
}

/**
 * `count(*)` for every table backing a numbering family, in ONE round trip.
 * `to_regclass` keeps a not-yet-migrated table from taking the page down: an
 * absent relation simply reports null instead of raising 42P01.
 */
async function issuedCounts(): Promise<Map<string, number>> {
  const entries = Object.entries(ISSUED_COUNT_TABLES).filter(([, t]) =>
    SAFE_IDENT.test(t),
  );
  const parts = entries.map(
    ([key, table]) =>
      `SELECT '${key}' AS series_key, (SELECT count(*)::int FROM "${table}") AS n WHERE to_regclass('public.${table}') IS NOT NULL`,
  );
  const out = new Map<string, number>();
  if (parts.length === 0) return out;
  try {
    const rows = (await db.execute(
      sql.raw(parts.join(" UNION ALL ")),
    )) as unknown as Array<{ series_key: string; n: number | string }>;
    for (const r of rows) out.set(r.series_key, Number(r.n));
  } catch (err) {
    // Counts are decoration, never the point of the page — degrade quietly.
    console.error("[numbering] issued counts failed (non-fatal)", err);
  }
  return out;
}

/**
 * Live `last_value` / `is_called` for the named sequences. Every name is first
 * intersected with `pg_sequences` (and re-checked against SAFE_IDENT) before it
 * is interpolated, so a hostile `sequence_name` cannot reach the parser.
 */
export async function readSequenceStates(
  names: string[],
): Promise<Map<string, { lastValue: number; isCalled: boolean }>> {
  const out = new Map<string, { lastValue: number; isCalled: boolean }>();
  const wanted = [...new Set(names.filter((n) => SAFE_IDENT.test(n)))];
  if (wanted.length === 0) return out;

  const existing = (await db.execute(
    sql`SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`,
  )) as unknown as Array<{ sequencename: string }>;
  const known = new Set(existing.map((r) => r.sequencename));
  const usable = wanted.filter((n) => known.has(n) && SAFE_IDENT.test(n));
  if (usable.length === 0) return out;

  const query = usable
    .map(
      (n) =>
        `SELECT '${n}' AS name, last_value, is_called FROM "${n}"`,
    )
    .join(" UNION ALL ");
  const rows = (await db.execute(sql.raw(query))) as unknown as Array<{
    name: string;
    last_value: number | string;
    is_called: boolean;
  }>;
  for (const r of rows) {
    out.set(r.name, { lastValue: Number(r.last_value), isCalled: r.is_called });
  }
  return out;
}

/** Does a sequence with this name exist in the public schema? */
export async function sequenceExists(name: string): Promise<boolean> {
  if (!SAFE_IDENT.test(name)) return false;
  const rows = (await db.execute(
    sql`SELECT 1 AS ok FROM pg_sequences WHERE schemaname = 'public' AND sequencename = ${name}`,
  )) as unknown as Array<{ ok: number }>;
  return rows.length > 0;
}

/** The most recent real SM number, so sm_suffix previews aren't invented. */
async function latestSmNumber(): Promise<string> {
  try {
    const [row] = await db
      .select({ smNumber: inquiries.smNumber })
      .from(inquiries)
      .orderBy(desc(inquiries.createdAt))
      .limit(1);
    return row?.smNumber ?? FALLBACK_SM_NUMBER;
  } catch (err) {
    console.error("[numbering] latest SM lookup failed (non-fatal)", err);
    return FALLBACK_SM_NUMBER;
  }
}

/**
 * Everything /admin/numbering renders. Resilient by design: a fresh database
 * (migration applied, nothing seeded) returns empty lists, and a database where
 * migration 0071 has NOT been applied returns `schemaReady: false` instead of
 * throwing, so the page can tell the admin exactly which command to run.
 */
export async function getNumberingOverview(): Promise<NumberingOverview> {
  const currentFy = financialYear();
  const nextFy = nextFinancialYear(currentFy);

  let formats: Array<typeof docNumberFormats.$inferSelect>;
  try {
    formats = await db
      .select()
      .from(docNumberFormats)
      .orderBy(
        asc(docNumberFormats.module),
        asc(docNumberFormats.sortOrder),
        asc(docNumberFormats.seriesKey),
      );
  } catch (err) {
    if (isMissingRelation(err, "doc_number_formats")) {
      return {
        schemaReady: false,
        families: [],
        orphanCounters: [],
        unregistered: [],
        currentFy,
        nextFy,
        sampleSmNumber: FALLBACK_SM_NUMBER,
        totals: { families: 0, active: 0, fyRegisters: 0, liveSequences: 0, issued: 0 },
      };
    }
    throw err;
  }

  const [counterRows, counts, sampleSmNumber] = await Promise.all([
    db
      .select()
      .from(docNumberSeries)
      .orderBy(asc(docNumberSeries.seriesKey), asc(docNumberSeries.fyLabel)),
    issuedCounts(),
    latestSmNumber(),
  ]);

  const sequenceNames = formats
    .filter((f) => f.strategy === "sequence" && f.sequenceName)
    .map((f) => f.sequenceName as string);
  let sequenceStates = new Map<string, { lastValue: number; isCalled: boolean }>();
  try {
    sequenceStates = await readSequenceStates(sequenceNames);
  } catch (err) {
    console.error("[numbering] sequence read failed (non-fatal)", err);
  }

  const countersByKey = new Map<string, typeof counterRows>();
  for (const row of counterRows) {
    const list = countersByKey.get(row.seriesKey);
    if (list) list.push(row);
    else countersByKey.set(row.seriesKey, [row]);
  }

  const families: NumberingFamily[] = formats.map((f) => {
    const counters: FyCounter[] =
      f.strategy === "fy_series"
        ? (countersByKey.get(f.seriesKey) ?? [])
            .slice()
            .sort((a, b) => compareFinancialYears(a.fyLabel, b.fyLabel))
            .map((c) => ({
              fyLabel: c.fyLabel,
              prefix: c.prefix,
              padTo: c.padTo,
              lastValue: c.lastValue,
              nextValue: c.lastValue + 1,
              nextFormatted: previewNumber(
                { strategy: "fy_series", prefix: c.prefix, padTo: c.padTo },
                {
                  fyLabel: c.fyLabel,
                  nextValue: c.lastValue + 1,
                  sampleSmNumber,
                },
              ),
              isCurrentFy: c.fyLabel === currentFy,
              driftsFromFormat: c.prefix !== f.prefix || c.padTo !== f.padTo,
              updatedAt: c.updatedAt,
            }))
        : [];

    let sequence: SequenceState | null = null;
    if (f.strategy === "sequence" && f.sequenceName) {
      const state = sequenceStates.get(f.sequenceName);
      sequence = {
        sequenceName: f.sequenceName,
        exists: state !== undefined,
        lastValue: state ? state.lastValue : null,
        isCalled: state?.isCalled ?? false,
        // `is_called = false` means last_value itself is handed out next
        // (that is what setval(seq, n, false) sets up).
        nextValue: state ? (state.isCalled ? state.lastValue + 1 : state.lastValue) : null,
      };
    }

    // Which value drives the preview depends on where the counter lives.
    const currentCounter = counters.find((c) => c.isCurrentFy);
    const nextValue =
      f.strategy === "fy_series"
        ? (currentCounter?.nextValue ?? 1)
        : f.strategy === "sequence"
          ? (sequence?.nextValue ?? 1)
          : 1; // sm_suffix: the first document against a given SM number

    const previewPrefix = currentCounter?.prefix ?? f.prefix;
    const previewPad = currentCounter?.padTo ?? f.padTo;

    return {
      id: f.id,
      seriesKey: f.seriesKey,
      label: f.label,
      module: f.module,
      strategy: f.strategy,
      prefix: f.prefix,
      separator: f.separator,
      padTo: f.padTo,
      includeFy: f.includeFy,
      sequenceName: f.sequenceName,
      isActive: f.isActive,
      sortOrder: f.sortOrder,
      updatedAt: f.updatedAt,
      counters,
      sequence,
      issuedCount: counts.get(f.seriesKey) ?? null,
      nextPreview: previewNumber(
        { strategy: f.strategy, prefix: previewPrefix, padTo: previewPad },
        { fyLabel: currentFy, nextValue, sampleSmNumber },
      ),
      source: mintedBy(f.strategy, f.sequenceName),
      canEditFormat: prefixIsEditable(f.strategy),
    };
  });

  const knownKeys = new Set(formats.map((f) => f.seriesKey));
  const orphanCounters: OrphanCounter[] = counterRows
    .filter((c) => !knownKeys.has(c.seriesKey))
    .map((c) => ({
      seriesKey: c.seriesKey,
      fyLabel: c.fyLabel,
      prefix: c.prefix,
      padTo: c.padTo,
      lastValue: c.lastValue,
      nextFormatted: previewNumber(
        { strategy: "fy_series", prefix: c.prefix, padTo: c.padTo },
        { fyLabel: c.fyLabel, nextValue: c.lastValue + 1, sampleSmNumber },
      ),
    }));

  return {
    schemaReady: true,
    families,
    orphanCounters,
    unregistered: DETECTED_FAMILIES.filter((d) => !knownKeys.has(d.seriesKey)),
    currentFy,
    nextFy,
    sampleSmNumber,
    totals: {
      families: families.length,
      active: families.filter((f) => f.isActive).length,
      fyRegisters: counterRows.length,
      liveSequences: families.filter((f) => f.sequence?.exists).length,
      issued: families.reduce((sum, f) => sum + (f.issuedCount ?? 0), 0),
    },
  };
}
