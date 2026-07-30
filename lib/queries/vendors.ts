import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors, type Vendor } from "@/db/schema";

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
  defaultCreditDays: number | null;
  paymentTerms: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Every vendor (active + inactive) shaped for the register table, sorted
 * alphabetically (locale-aware — Postgres `order by name` is byte-order, so we
 * re-sort with a collator so "acme" and "AA Tools" land where a human expects).
 */
export async function listVendors(): Promise<VendorRegisterRow[]> {
  const rows = await db
    .select({
      id: vendors.id,
      vendorCode: vendors.vendorCode,
      name: vendors.name,
      contactPerson: vendors.contactPerson,
      contactNo: vendors.contactNo,
      email: vendors.email,
      defaultCreditDays: vendors.defaultCreditDays,
      paymentTerms: vendors.paymentTerms,
      isActive: vendors.isActive,
      createdAt: vendors.createdAt,
    })
    .from(vendors)
    .orderBy(asc(vendors.name));

  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Full vendor row for the record + edit pages, or null when not found. */
export async function getVendorById(id: string): Promise<Vendor | null> {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return row ?? null;
}

export interface VendorOption {
  id: string;
  name: string;
  vendorCode: string | null;
  defaultCreditDays: number | null;
  paymentTerms: string | null;
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
