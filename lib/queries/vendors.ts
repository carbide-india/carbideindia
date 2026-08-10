import "server-only";
import { asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  vendors,
  costings,
  costingVendorQuotes,
  documents,
  employees,
  type Vendor,
} from "@/db/schema";
import { getDocumentDownloadUrls } from "@/lib/storage/blob";

/**
 * One vendor row shaped for the Vendor Master register (`/vendors`). Carries the
 * display fields the table needs; every vendor (active + inactive) is returned
 * so the register can show a status column + recycle deactivated rows. Admin-only
 * caller (the register route is `requireAdmin`-gated).
 */
export interface VendorRegisterRow {
  id: string;
  vendorCode: string | null;
  name: string;
  contactPerson: string | null;
  contactNo: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  /** The GST number itself (migration 0072) — null until someone records it. */
  gstin: string | null;
  /** Whether GST applies at all. A `false` vendor is never counted GST-missing. */
  isGstApplicable: boolean;
  website: string | null;
  defaultCreditDays: number | null;
  paymentTerms: string | null;
  /** How many documents hang off this vendor (0 for every vendor with none). */
  attachmentCount: number;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Every vendor (active + inactive) shaped for the register table, sorted
 * alphabetically (locale-aware — Postgres `order by name` is byte-order, so we
 * re-sort with a collator so "acme" and "AA Tools" land where a human expects).
 *
 * Attachment counts come from ONE grouped query over `documents` (never N+1),
 * left-folded onto the vendor rows so a vendor with no documents reads 0 rather
 * than dropping out — the register's "No Attachment" tile counts exactly those.
 */
export async function listVendors(): Promise<VendorRegisterRow[]> {
  const [rows, docCounts] = await Promise.all([
    db
      .select({
        id: vendors.id,
        vendorCode: vendors.vendorCode,
        name: vendors.name,
        contactPerson: vendors.contactPerson,
        contactNo: vendors.contactNo,
        email: vendors.email,
        city: vendors.city,
        state: vendors.state,
        gstin: vendors.gstin,
        isGstApplicable: vendors.isGstApplicable,
        website: vendors.website,
        defaultCreditDays: vendors.defaultCreditDays,
        paymentTerms: vendors.paymentTerms,
        isActive: vendors.isActive,
        createdAt: vendors.createdAt,
      })
      .from(vendors)
      .orderBy(asc(vendors.name)),
    db
      .select({ vendorId: documents.vendorId, n: count() })
      .from(documents)
      .where(isNotNull(documents.vendorId))
      .groupBy(documents.vendorId),
  ]);

  const countByVendor = new Map<string, number>();
  for (const c of docCounts) {
    if (c.vendorId) countByVendor.set(c.vendorId, Number(c.n));
  }

  return rows
    .map((r) => ({ ...r, attachmentCount: countByVendor.get(r.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * One attachment on a vendor (brochure, price list, certificate, …). Same shape
 * as `ClientDocument` — vendor attachments reuse the WHOLE existing document
 * stack (documents table + /api/documents/upload client-upload route), they are
 * not a second file system.
 */
export interface VendorDocument {
  id: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  /** Short-lived presigned download URL (null if presigning failed). */
  downloadUrl: string | null;
}

/**
 * Every document attached to a vendor, newest first, each carrying a fresh
 * presigned download URL. Mirrors `getClientDocuments`: ONE read-scoped token
 * issuance, then every row's URL is presigned locally — N docs never become N
 * HTTP round-trips. Presign failure degrades to `downloadUrl: null` and the UI
 * shows "Unavailable" rather than a broken link.
 */
export async function getVendorDocuments(vendorId: string): Promise<VendorDocument[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(documents.uploadedById, employees.id))
    .where(eq(documents.vendorId, vendorId))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  let urlByPath = new Map<string, string>();
  try {
    urlByPath = await getDocumentDownloadUrls(rows.map((r) => r.storagePath));
  } catch {
    // presigning unavailable (e.g. missing BLOB_READ_WRITE_TOKEN) — degrade.
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedByName: r.uploadedByName ?? null,
    createdAt: r.createdAt,
    downloadUrl: urlByPath.get(r.storagePath) ?? null,
  }));
}

/** Full vendor row for the record + edit pages, or null when not found. */
export async function getVendorById(id: string): Promise<Vendor | null> {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return row ?? null;
}

/**
 * A vendor's historical quoting record, derived entirely from the costing
 * BO matrix (`costing_vendor_quotes`) we already capture — NO new tracking.
 * Every field degrades to zero/null when the vendor has never been quoted, so
 * callers can render unconditionally and hide gracefully.
 */
export interface VendorHistory {
  /** How many BO vendor-quote rows reference this vendor (across all costings). */
  timesQuoted: number;
  /** Unit price (₹) of the most recent quote, by costing date; null when none. */
  lastUnitPrice: number | null;
  /** Date of the most recent quote (the parent costing's createdAt); null when none. */
  lastQuotedAt: Date | null;
  /** Mean unit price (₹) across every quote; null when none. */
  avgUnitPrice: number | null;
}

const EMPTY_HISTORY: VendorHistory = {
  timesQuoted: 0,
  lastUnitPrice: null,
  lastQuotedAt: null,
  avgUnitPrice: null,
};

/**
 * Historical quoting metrics for many vendors in one query (avoids N+1 when the
 * BO matrix shows several vendor rows). Reads only `costing_vendor_quotes`,
 * joined to `costings` for the quote date. Vendors with no history are simply
 * absent from the returned map — look them up with a `?? {zeros}` fallback (see
 * {@link getVendorHistory}). Aggregation is done in JS: the volume of vendor
 * quotes is small and this keeps the "most recent by date" logic obvious.
 */
export async function getVendorHistories(
  vendorIds: string[],
): Promise<Map<string, VendorHistory>> {
  const out = new Map<string, VendorHistory>();
  const ids = Array.from(new Set(vendorIds.filter((v): v is string => Boolean(v))));
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      vendorId: costingVendorQuotes.vendorId,
      unitPrice: costingVendorQuotes.unitPrice,
      quotedAt: costings.createdAt,
    })
    .from(costingVendorQuotes)
    .innerJoin(costings, eq(costingVendorQuotes.costingId, costings.id))
    .where(inArray(costingVendorQuotes.vendorId, ids));

  const acc = new Map<
    string,
    { count: number; sum: number; last: { at: Date; price: number | null } | null }
  >();

  for (const r of rows) {
    if (!r.vendorId) continue;
    const price = r.unitPrice == null ? NaN : Number(r.unitPrice);
    const hasPrice = Number.isFinite(price);
    const at = r.quotedAt instanceof Date ? r.quotedAt : new Date(r.quotedAt);

    const bucket = acc.get(r.vendorId) ?? { count: 0, sum: 0, last: null };
    bucket.count += 1;
    if (hasPrice) bucket.sum += price;
    if (!bucket.last || at.getTime() >= bucket.last.at.getTime()) {
      bucket.last = { at, price: hasPrice ? price : null };
    }
    acc.set(r.vendorId, bucket);
  }

  for (const [vendorId, b] of acc) {
    out.set(vendorId, {
      timesQuoted: b.count,
      lastUnitPrice: b.last?.price ?? null,
      lastQuotedAt: b.last?.at ?? null,
      avgUnitPrice: b.count > 0 ? b.sum / b.count : null,
    });
  }

  return out;
}

/** Single-vendor convenience wrapper over {@link getVendorHistories}. */
export async function getVendorHistory(vendorId: string): Promise<VendorHistory> {
  const map = await getVendorHistories([vendorId]);
  return map.get(vendorId) ?? EMPTY_HISTORY;
}

export interface VendorOption {
  id: string;
  name: string;
  vendorCode: string | null;
  defaultCreditDays: number | null;
  paymentTerms: string | null;
  /**
   * Historical quoting metrics, hydrated up front by the costing page so the BO
   * matrix can show a "Quoted N× · last ₹X · avg ₹Y" chip on vendor selection
   * without a per-keystroke fetch. Absent (undefined) when not hydrated (e.g.
   * the register picker); null when the vendor has no quoting history yet.
   */
  history?: VendorHistory | null;
}

/**
 * Active vendors as pickable options — drives the Phase-3 BO (bought-out) matrix
 * vendor picker, which pre-fills a chosen vendor's default credit-days /
 * payment-terms into a new quote row. Alphabetical, locale-aware.
 */
export async function listVendorOptions(): Promise<VendorOption[]> {
  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      vendorCode: vendors.vendorCode,
      defaultCreditDays: vendors.defaultCreditDays,
      paymentTerms: vendors.paymentTerms,
    })
    .from(vendors)
    .where(eq(vendors.isActive, true))
    .orderBy(asc(vendors.name));

  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
