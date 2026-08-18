import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inquiries,
  inquiryItems,
  costings,
  quotations,
  salesOrders,
} from "@/db/schema";
import type { BoardCard, BoardModule } from "@/lib/board/registry";

/**
 * Card feeds for the stage boards.
 *
 * One small select per stage rather than reusing the register queries: a
 * register row carries a dozen columns a card never shows (variance, checks,
 * costing revisions), and a board that loaded all of it would be the slowest
 * screen in the app for the least reason. Each of these reads only what a card
 * paints — id, title, company, one fact, the bucket, and when it last moved.
 */

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Enquiries, by their own stage status. */
async function enquiryCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      status: inquiries.enquiryStatus,
      updatedAt: inquiries.updatedAt,
      enquiryDate: inquiries.enquiryDate,
    })
    .from(inquiries)
    .where(eq(inquiries.isArchived, false))
    .orderBy(desc(inquiries.enquiryDate));

  return rows.map((r) => ({
    id: r.id,
    title: r.smNumber,
    subtitle: r.companyName,
    meta: r.enquiryDate ? r.enquiryDate.toISOString().slice(0, 10) : null,
    bucket: r.status,
    href: `/enquiries/register/${r.id}`,
    updatedAt: iso(r.updatedAt),
  }));
}

/** The same enquiries, by their PRIMARY FEASIBILITY status. */
async function feasibilityCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      status: inquiries.feasibilityStatus,
      updatedAt: inquiries.updatedAt,
    })
    .from(inquiries)
    .where(eq(inquiries.isArchived, false))
    .orderBy(desc(inquiries.enquiryDate));

  return rows.map((r) => ({
    id: r.id,
    title: r.smNumber,
    subtitle: r.companyName,
    meta: null,
    bucket: r.status,
    href: `/feasibility/${r.id}`,
    updatedAt: iso(r.updatedAt),
  }));
}

/** Product LINES, by their secondary/technical status. */
async function secondaryCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      productName: inquiryItems.custProductName,
      status: inquiryItems.secondaryFeasibilityStatus,
      updatedAt: inquiryItems.updatedAt,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
    .where(eq(inquiries.isArchived, false));

  return rows.map((r) => ({
    id: r.id,
    title: r.smNumber,
    subtitle: r.companyName,
    meta: r.productName,
    bucket: r.status,
    href: `/secondary-feasibility/${r.inquiryId}`,
    updatedAt: iso(r.updatedAt),
  }));
}

/**
 * Cost SHEETS. Costable lines with no sheet yet are deliberately absent: the
 * card would have no row to move, and inventing one on drop would create a
 * cost sheet by accident. Start those from the register's "Start costing".
 */
async function costingCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: costings.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      productName: inquiryItems.custProductName,
      status: costings.costingDoneStatus,
      updatedAt: costings.updatedAt,
    })
    .from(costings)
    .innerJoin(inquiries, eq(inquiries.id, costings.inquiryId))
    .leftJoin(inquiryItems, eq(inquiryItems.id, costings.inquiryItemId))
    .orderBy(desc(costings.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.smNumber,
    subtitle: r.companyName,
    meta: r.productName,
    bucket: r.status,
    href: `/costings/${r.id}`,
    updatedAt: iso(r.updatedAt),
  }));
}

async function quotationCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      companyName: quotations.companyName,
      status: quotations.quotationStatus,
      quotePrice: quotations.quotePrice,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .orderBy(desc(quotations.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.quoteNo,
    subtitle: r.companyName,
    meta: r.quotePrice ? `₹${r.quotePrice}` : null,
    bucket: r.status,
    href: `/quotations/${r.id}`,
    updatedAt: iso(r.updatedAt),
  }));
}

async function salesOrderCards(): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: salesOrders.id,
      soNo: salesOrders.soNo,
      companyName: salesOrders.companyName,
      status: salesOrders.salesOrderStatus,
      customerPoNo: salesOrders.customerPoNo,
      updatedAt: salesOrders.updatedAt,
    })
    .from(salesOrders)
    .orderBy(desc(salesOrders.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.soNo,
    subtitle: r.companyName,
    meta: r.customerPoNo ? `PO ${r.customerPoNo}` : null,
    bucket: r.status,
    href: `/sales-orders/${r.id}`,
    updatedAt: iso(r.updatedAt),
  }));
}

export async function listBoardCards(module: BoardModule): Promise<BoardCard[]> {
  switch (module) {
    case "enquiry":
      return enquiryCards();
    case "feasibility":
      return feasibilityCards();
    case "secondary-feasibility":
      return secondaryCards();
    case "costing":
      return costingCards();
    case "quotation":
      return quotationCards();
    case "sales-order":
      return salesOrderCards();
  }
}
