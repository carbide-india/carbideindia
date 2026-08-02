import "server-only";
import { asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proformaInvoices,
  proformaInvoiceItems,
  negotiations,
  inquiries,
  type ProformaInvoice,
  type ProformaInvoiceItem,
} from "@/db/schema";
import type { NegotiationStage } from "@/db/enums";

/**
 * Proforma Invoice reads (2026-08-02). A PI is the priced sign-off document a
 * negotiation issues between the quote and the customer PO. Each negotiation can
 * issue several PIs across revisions (numbered `<SM>-PI##`).
 */

/** Every PI issued against a negotiation, newest iteration first, with its items. */
export interface ProformaInvoiceWithItems extends ProformaInvoice {
  items: ProformaInvoiceItem[];
}

export async function listProformaInvoicesForNegotiation(
  negotiationId: string,
): Promise<ProformaInvoiceWithItems[]> {
  const heads = await db
    .select()
    .from(proformaInvoices)
    .where(eq(proformaInvoices.negotiationId, negotiationId))
    .orderBy(desc(proformaInvoices.iteration));
  if (heads.length === 0) return [];

  const lines = await db
    .select()
    .from(proformaInvoiceItems)
    .where(
      inArray(
        proformaInvoiceItems.proformaInvoiceId,
        heads.map((h) => h.id),
      ),
    )
    .orderBy(asc(proformaInvoiceItems.sortOrder));

  const byPi = new Map<string, ProformaInvoiceItem[]>();
  for (const l of lines) {
    const arr = byPi.get(l.proformaInvoiceId);
    if (arr) arr.push(l);
    else byPi.set(l.proformaInvoiceId, [l]);
  }
  return heads.map((h) => ({ ...h, items: byPi.get(h.id) ?? [] }));
}

/** A single PI with its items + the SM/company/negotiation context (for the PDF). */
export interface ProformaInvoiceDetail {
  pi: ProformaInvoice;
  items: ProformaInvoiceItem[];
  smNumber: string | null;
  companyName: string | null;
  negotiationNo: string | null;
}

export async function getProformaInvoiceById(
  id: string,
): Promise<ProformaInvoiceDetail | null> {
  const [row] = await db
    .select({
      pi: proformaInvoices,
      smNumber: inquiries.smNumber,
      companyName: negotiations.companyName,
      inquiryCompanyName: inquiries.companyName,
      negotiationNo: negotiations.negotiationNo,
    })
    .from(proformaInvoices)
    .leftJoin(negotiations, eq(proformaInvoices.negotiationId, negotiations.id))
    .leftJoin(inquiries, eq(proformaInvoices.inquiryId, inquiries.id))
    .where(eq(proformaInvoices.id, id))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(proformaInvoiceItems)
    .where(eq(proformaInvoiceItems.proformaInvoiceId, id))
    .orderBy(asc(proformaInvoiceItems.sortOrder));

  return {
    pi: row.pi,
    items,
    smNumber: row.smNumber ?? null,
    companyName: row.companyName ?? row.inquiryCompanyName ?? null,
    negotiationNo: row.negotiationNo ?? null,
  };
}

/** One row of the Customer PO register — every negotiation carrying a customer PO. */
export interface CustomerPoRegisterRow {
  negotiationId: string;
  negotiationNo: string;
  smNumber: string | null;
  companyName: string | null;
  negotiationStage: NegotiationStage;
  customerPoNo: string | null;
  customerPoDate: Date | null;
  customerPoLink: string | null;
  customerPoRemarks: string | null;
  poMatchStatus: string | null;
  /** All PI numbers issued against this negotiation, iteration order. */
  piNos: string[];
  /** Revised total of the latest (highest-iteration) PI. */
  latestPiTotal: string | null;
}

/**
 * The Customer PO register — every negotiation that has received a customer PO
 * (a PO number OR a PO link present), newest first, with its PI numbers and the
 * latest PI total for the PI↔PO reconciliation view. Uncached (per-user page).
 */
export async function listCustomerPoRegister(): Promise<CustomerPoRegisterRow[]> {
  const rows = await db
    .select({
      negotiationId: negotiations.id,
      negotiationNo: negotiations.negotiationNo,
      smNumber: inquiries.smNumber,
      negotiationCompany: negotiations.companyName,
      inquiryCompany: inquiries.companyName,
      negotiationStage: negotiations.negotiationStage,
      customerPoNo: negotiations.customerPoNo,
      customerPoDate: negotiations.customerPoDate,
      customerPoLink: negotiations.customerPoLink,
      customerPoRemarks: negotiations.customerPoRemarks,
      poMatchStatus: negotiations.poMatchStatus,
    })
    .from(negotiations)
    .leftJoin(inquiries, eq(negotiations.inquiryId, inquiries.id))
    .where(
      or(
        isNotNull(negotiations.customerPoNo),
        isNotNull(negotiations.customerPoLink),
      ),
    )
    .orderBy(desc(negotiations.customerPoDate), desc(negotiations.createdAt));
  if (rows.length === 0) return [];

  // PIs for every listed negotiation, iteration ascending, in one query.
  const pis = await db
    .select({
      negotiationId: proformaInvoices.negotiationId,
      piNo: proformaInvoices.piNo,
      iteration: proformaInvoices.iteration,
      revisedTotal: proformaInvoices.revisedTotal,
    })
    .from(proformaInvoices)
    .where(
      inArray(
        proformaInvoices.negotiationId,
        rows.map((r) => r.negotiationId),
      ),
    )
    .orderBy(asc(proformaInvoices.iteration));

  const piByNeg = new Map<string, { piNos: string[]; latestTotal: string | null }>();
  for (const p of pis) {
    const entry = piByNeg.get(p.negotiationId) ?? { piNos: [], latestTotal: null };
    if (p.piNo) entry.piNos.push(p.piNo);
    // pis are iteration-ascending, so the last seen is the latest.
    entry.latestTotal = p.revisedTotal ?? entry.latestTotal;
    piByNeg.set(p.negotiationId, entry);
  }

  return rows.map((r) => {
    const pi = piByNeg.get(r.negotiationId);
    return {
      negotiationId: r.negotiationId,
      negotiationNo: r.negotiationNo,
      smNumber: r.smNumber ?? null,
      companyName: r.negotiationCompany ?? r.inquiryCompany ?? null,
      negotiationStage: r.negotiationStage,
      customerPoNo: r.customerPoNo,
      customerPoDate: r.customerPoDate,
      customerPoLink: r.customerPoLink,
      customerPoRemarks: r.customerPoRemarks,
      poMatchStatus: r.poMatchStatus,
      piNos: pi?.piNos ?? [],
      latestPiTotal: pi?.latestTotal ?? null,
    };
  });
}
