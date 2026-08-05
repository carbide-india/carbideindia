import "server-only";
import { and, asc, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { hsnCodes, invoiceLines, items, taxRates } from "@/db/schema";

/**
 * Read side of admin → Tax & GST (`tax_rates` + `hsn_codes`).
 *
 * Both tables come back from postgres-js with their `numeric` columns as
 * STRINGS, so every percent is parsed with Number() here and the UI only ever
 * sees real numbers.  Usage counts are deliberately computed as separate
 * grouped aggregates rather than joins: `invoice_lines.tax_rate` is a frozen
 * numeric (no FK to tax_rates) and `items.hsn_code` is free text (no FK to
 * hsn_codes), so the "how many documents use this" answer is a value match,
 * not a relational one.
 */

/** Percent columns are numeric → string; tolerate null/garbage as 0. */
function pct(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Canonical form for an HSN code comparison (uppercase, no spaces/dashes). */
export function normalizeHsnCode(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export interface TaxRateRow {
  id: string;
  label: string;
  ratePercent: number;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  /** HSN master rows pointing at this rate. */
  hsnCount: number;
  /** Frozen invoice lines raised at this exact total rate. */
  invoiceLineCount: number;
  updatedAt: Date;
}

/** invoice_lines grouped by their frozen total rate → count. */
async function invoiceLineCountsByRate(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      rate: invoiceLines.taxRate,
      n: sql<number>`count(*)::int`,
    })
    .from(invoiceLines)
    .groupBy(invoiceLines.taxRate);

  const map = new Map<number, number>();
  for (const r of rows) {
    const key = pct(r.rate);
    map.set(key, (map.get(key) ?? 0) + r.n);
  }
  return map;
}

/** hsn_codes grouped by the rate they map to → count. */
async function hsnCountsByRate(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      taxRateId: hsnCodes.taxRateId,
      n: sql<number>`count(*)::int`,
    })
    .from(hsnCodes)
    .groupBy(hsnCodes.taxRateId);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.taxRateId) continue;
    map.set(r.taxRateId, r.n);
  }
  return map;
}

/**
 * Every tax rate (active and inactive — the admin page renders both), ordered
 * by sort_order then rate.  Pickers should filter on `.isActive` themselves.
 */
export async function listTaxRates(): Promise<TaxRateRow[]> {
  const [rows, byRate, byHsn] = await Promise.all([
    db
      .select()
      .from(taxRates)
      .orderBy(asc(taxRates.sortOrder), asc(taxRates.ratePercent)),
    invoiceLineCountsByRate(),
    hsnCountsByRate(),
  ]);

  return rows.map((r) => {
    const ratePercent = pct(r.ratePercent);
    return {
      id: r.id,
      label: r.label,
      ratePercent,
      cgstPercent: pct(r.cgstPercent),
      sgstPercent: pct(r.sgstPercent),
      igstPercent: pct(r.igstPercent),
      isDefault: r.isDefault,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      hsnCount: byHsn.get(r.id) ?? 0,
      invoiceLineCount: byRate.get(ratePercent) ?? 0,
      updatedAt: r.updatedAt,
    };
  });
}

export interface HsnCodeRow {
  id: string;
  code: string;
  description: string | null;
  taxRateId: string | null;
  /** Denormalized for display — null when the mapping is missing/deleted. */
  taxRateLabel: string | null;
  taxRatePercent: number | null;
  defaultUom: string | null;
  isActive: boolean;
  /** Item Master rows carrying this exact code. */
  itemCount: number;
  updatedAt: Date;
}

/** items grouped by their free-text HSN code → count (normalized keys). */
async function itemCountsByHsn(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      code: items.hsnCode,
      n: sql<number>`count(*)::int`,
    })
    .from(items)
    .where(and(isNotNull(items.hsnCode), ne(items.hsnCode, "")))
    .groupBy(items.hsnCode);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.code) continue;
    const key = normalizeHsnCode(r.code);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + r.n);
  }
  return map;
}

/** Every HSN master row with its mapped rate resolved and item usage counted. */
export async function listHsnCodes(): Promise<HsnCodeRow[]> {
  const [rows, byCode] = await Promise.all([
    db
      .select({
        id: hsnCodes.id,
        code: hsnCodes.code,
        description: hsnCodes.description,
        taxRateId: hsnCodes.taxRateId,
        defaultUom: hsnCodes.defaultUom,
        isActive: hsnCodes.isActive,
        updatedAt: hsnCodes.updatedAt,
        taxRateLabel: taxRates.label,
        taxRatePercent: taxRates.ratePercent,
      })
      .from(hsnCodes)
      .leftJoin(taxRates, sql`${taxRates.id} = ${hsnCodes.taxRateId}`)
      .orderBy(asc(hsnCodes.code)),
    itemCountsByHsn(),
  ]);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    taxRateId: r.taxRateId,
    taxRateLabel: r.taxRateLabel ?? null,
    taxRatePercent:
      r.taxRatePercent === null || r.taxRatePercent === undefined
        ? null
        : pct(r.taxRatePercent),
    defaultUom: r.defaultUom,
    isActive: r.isActive,
    itemCount: byCode.get(normalizeHsnCode(r.code)) ?? 0,
    updatedAt: r.updatedAt,
  }));
}

export interface UnmappedHsnRow {
  /** The code exactly as the Item Master stores it. */
  code: string;
  itemCount: number;
  /** One example item code, so the admin can see what it's attached to. */
  sampleItemCode: string | null;
}

/**
 * HSN codes that live on Item Master rows but have no `hsn_codes` master row.
 * These are the codes that will NOT resolve a default GST rate at invoicing
 * time — the page offers a one-click "add to master" for each.
 */
export async function listUnmappedItemHsnCodes(): Promise<UnmappedHsnRow[]> {
  const [rows, mastered] = await Promise.all([
    db
      .select({
        code: items.hsnCode,
        itemCount: sql<number>`count(*)::int`,
        sampleItemCode: sql<string | null>`min(${items.itemCode})`,
      })
      .from(items)
      .where(and(isNotNull(items.hsnCode), ne(items.hsnCode, "")))
      .groupBy(items.hsnCode),
    db.select({ code: hsnCodes.code }).from(hsnCodes),
  ]);

  const known = new Set(mastered.map((m) => normalizeHsnCode(m.code)));

  // Fold by normalized key so "8209" and "82 09" collapse into one suggestion.
  const merged = new Map<string, UnmappedHsnRow>();
  for (const r of rows) {
    if (!r.code) continue;
    const key = normalizeHsnCode(r.code);
    if (!key || known.has(key)) continue;
    const prev = merged.get(key);
    if (prev) {
      prev.itemCount += r.itemCount;
      if (!prev.sampleItemCode) prev.sampleItemCode = r.sampleItemCode;
    } else {
      merged.set(key, {
        code: r.code.trim(),
        itemCount: r.itemCount,
        sampleItemCode: r.sampleItemCode,
      });
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.itemCount - a.itemCount || a.code.localeCompare(b.code),
  );
}

export interface ResolvedTaxRate {
  id: string;
  label: string;
  ratePercent: number;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
}

/**
 * The rate applied to a brand-new quotation / invoice line when nothing more
 * specific is known.  Exactly one active row should carry `is_default` (the
 * server action enforces it inside a transaction); if several somehow do we
 * take the lowest sort_order so the answer is at least deterministic.
 * Returns null on a fresh database with no rates seeded yet — callers must
 * treat that as "no tax configured", never as 0%.
 */
export async function getDefaultTaxRate(): Promise<ResolvedTaxRate | null> {
  const rows = await db
    .select()
    .from(taxRates)
    .where(sql`${taxRates.isDefault} = true and ${taxRates.isActive} = true`)
    .orderBy(asc(taxRates.sortOrder), asc(taxRates.ratePercent))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    label: r.label,
    ratePercent: pct(r.ratePercent),
    cgstPercent: pct(r.cgstPercent),
    sgstPercent: pct(r.sgstPercent),
    igstPercent: pct(r.igstPercent),
  };
}

/**
 * Resolve the GST rate for a line: the HSN master mapping first, the org
 * default second, null when neither exists.  This is the function downstream
 * quotation / invoice code should call instead of hardcoding 18.
 */
export async function resolveTaxRateForHsn(
  code: string | null | undefined,
): Promise<ResolvedTaxRate | null> {
  const key = normalizeHsnCode(code ?? "");
  if (key) {
    const rows = await db
      .select({
        id: taxRates.id,
        label: taxRates.label,
        ratePercent: taxRates.ratePercent,
        cgstPercent: taxRates.cgstPercent,
        sgstPercent: taxRates.sgstPercent,
        igstPercent: taxRates.igstPercent,
      })
      .from(hsnCodes)
      .innerJoin(taxRates, sql`${taxRates.id} = ${hsnCodes.taxRateId}`)
      .where(
        sql`${hsnCodes.isActive} = true and ${taxRates.isActive} = true
            and upper(regexp_replace(${hsnCodes.code}, '[^0-9A-Za-z]', '', 'g')) = ${key}`,
      )
      .limit(1);

    const r = rows[0];
    if (r) {
      return {
        id: r.id,
        label: r.label,
        ratePercent: pct(r.ratePercent),
        cgstPercent: pct(r.cgstPercent),
        sgstPercent: pct(r.sgstPercent),
        igstPercent: pct(r.igstPercent),
      };
    }
  }
  return getDefaultTaxRate();
}
