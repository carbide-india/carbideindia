/**
 * Gapless, FY-scoped document-number allocator (Phase 7, §11.3).
 *
 * WHY NOT A POSTGRES SEQUENCE
 * ---------------------------
 * A `SEQUENCE` is fast but NOT gapless: `nextval` is non-transactional, so a
 * rolled-back invoice permanently burns its number. Indian statute requires a
 * *gapless* invoice/DN register per financial year - you may not skip 42. So we
 * use a per-(series, FY) counter ROW in `doc_number_series` and increment it
 * inside the caller's transaction with a `SELECT  FOR UPDATE`.
 *
 * CONCURRENCY GUARANTEE
 * ---------------------
 * `nextDocNumber` runs inside a transaction and takes a ROW LOCK
 * (`SELECT  FOR UPDATE`) on the counter row for (seriesKey, fyLabel). Two
 * concurrent allocations for the same series+FY therefore serialize: the second
 * blocks until the first COMMITs, then reads the just-incremented value. Because
 * the increment and the document INSERT share ONE transaction, a rollback
 * releases the lock AND un-does the increment together - the number is never
 * consumed by a document that doesn't exist. Result: strictly monotonic, no
 * gaps, no duplicates, even under load. (If the counter row is missing we INSERT
 * it with `ON CONFLICT DO NOTHING` then re-select FOR UPDATE, so first-use of a
 * new FY is also race-safe.)
 *
 * The caller MUST pass the same `db.transaction(async (tx) => )` handle used to
 * insert the document, so the two are atomic.
 */
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

/** Series keys - one gapless register each, per financial year. */
export const SERIES_KEYS = ["invoice", "dn", "credit_note"] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];

/** Default human-number prefixes per series (overridable per-row in the DB). */
export const SERIES_DEFAULTS: Record<SeriesKey, { prefix: string; padTo: number }> = {
  invoice: { prefix: "INV", padTo: 4 },
  dn: { prefix: "DN", padTo: 4 },
  credit_note: { prefix: "CN", padTo: 4 },
};

/**
 * Indian financial year label for a date: Apr 1 → Mar 31, written "YYYY-YY".
 * e.g. 2026-07-02 → "2026-27"; 2027-02-15 → "2026-27"; 2027-04-01 → "2027-28".
 */
export function financialYearLabel(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0 = Jan  3 = Apr
  const startYear = m >= 3 ? y : y - 1; // Jan-Mar belong to the FY that began last April
  const endYY = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYY}`;
}

/**
 * Format a raw counter value into the human document number.
 * e.g. ("INV", "2026-27", 4, 42) → "INV/2026-27/0042".
 */
export function formatDocNumber(
  prefix: string,
  fyLabel: string,
  padTo: number,
  value: number,
): string {
  const padded = String(value).padStart(padTo, "0");
  return prefix ? `${prefix}/${fyLabel}/${padded}` : `${fyLabel}/${padded}`;
}

export interface NextDocNumber {
  /** The formatted human number, e.g. "INV/2026-27/0042". */
  formatted: string;
  /** The raw monotonic counter value (42). */
  value: number;
  seriesKey: SeriesKey;
  fyLabel: string;
}

// A permissive tx type - the concrete generics vary by driver; we only issue
// raw SQL through `.execute`, so this stays decoupled from the schema generics.
type AnyTx = PgTransaction<any, any, any>;

interface CounterRow {
  last_value: number | string;
  prefix: string;
  pad_to: number | string;
}

/**
 * Allocate the next gapless number for (seriesKey, fyLabel) inside `tx`.
 * Locks (and lazily creates) the counter row, increments it, and returns the
 * formatted number. Call from within the SAME transaction that inserts the
 * document so allocation and insert are atomic.
 *
 * @param tx        an open Drizzle pg transaction (from `db.transaction`)
 * @param seriesKey which register ("invoice" | "dn" | "credit_note")
 * @param date      the document date (drives the FY); defaults to now
 */
export async function nextDocNumber(
  tx: AnyTx,
  seriesKey: SeriesKey,
  date: Date = new Date(),
): Promise<NextDocNumber> {
  const fyLabel = financialYearLabel(date);
  const def = SERIES_DEFAULTS[seriesKey];

  // Ensure the counter row exists (race-safe: concurrent inserts collapse to
  // one via the unique (series_key, fy_label) index).
  await tx.execute(sql`
    INSERT INTO "doc_number_series" ("series_key", "fy_label", "prefix", "pad_to", "last_value")
    VALUES (${seriesKey}, ${fyLabel}, ${def.prefix}, ${def.padTo}, 0)
    ON CONFLICT ("series_key", "fy_label") DO NOTHING
  `);

  // Lock the row, then increment. FOR UPDATE serializes concurrent allocators
  // for this (series, FY): the loser blocks until the winner commits.
  const locked = (await tx.execute(sql`
    SELECT "last_value", "prefix", "pad_to"
    FROM "doc_number_series"
    WHERE "series_key" = ${seriesKey} AND "fy_label" = ${fyLabel}
    FOR UPDATE
  `)) as unknown as CounterRow[];

  const row = locked[0];
  if (!row) {
    // Should be impossible after the upsert, but fail loud rather than mint a bad number.
    throw new Error(`doc_number_series row missing for ${seriesKey}/${fyLabel}`);
  }

  const value = Number(row.last_value) + 1;
  const prefix = row.prefix;
  const padTo = Number(row.pad_to);

  await tx.execute(sql`
    UPDATE "doc_number_series"
    SET "last_value" = ${value}, "updated_at" = now()
    WHERE "series_key" = ${seriesKey} AND "fy_label" = ${fyLabel}
  `);

  return {
    formatted: formatDocNumber(prefix, fyLabel, padTo, value),
    value,
    seriesKey,
    fyLabel,
  };
}
