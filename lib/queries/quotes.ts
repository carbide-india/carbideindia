import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  inquiries,
  inquiryItems,
  employees,
  masterOptions,
  quotations,
  quotationItems,
  costings,
} from "@/db/schema";

/**
 * SM auto-fetch shared by the Quotation / Negotiation / Sales-Order forms.
 * Resolves the inquiry's snapshot block — company, dates, sales person name,
 * product/qty — and the grade/tolerance/condition master ids → their display
 * names via three aliased LEFT JOINs against `master_options` (the same row
 * type, so aliasing is required). `smNumber` is returned too so the create
 * actions can derive the per-SM number (`<SM>-Q01`) without a second query.
 */
export interface QuoteAutofill {
  smNumber: string;
  companyName: string | null;
  enquiryDate: Date | null;
  salesPersonId: string | null;
  salesPersonName: string | null;
  productDescription: string | null;
  quantityNos: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  // ── Dimension / shape fields (display-only in the downstream forms) ──
  shape: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
  // ── Primary contact snapshot ──
  contactFirstName: string | null;
  contactLastName: string | null;
  contactNo: string | null;
  contactEmail: string | null;
}

export async function getQuoteAutofill(
  inquiryId: string,
): Promise<QuoteAutofill | null> {
  const grade = alias(masterOptions, "grade");
  const tolerance = alias(masterOptions, "tolerance");
  const condition = alias(masterOptions, "condition");

  const [row] = await db
    .select({
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryDate: inquiries.enquiryDate,
      salesPersonId: inquiries.assignedSalesPersonId,
      salesPersonName: employees.name,
      productDescription: inquiries.productDescription,
      quantityNos: inquiries.quantityNos,
      gradeName: grade.name,
      toleranceName: tolerance.name,
      conditionName: condition.name,
      shape: inquiries.shape,
      outerDia: inquiries.outerDia,
      innerDia: inquiries.innerDia,
      length: inquiries.length,
      width: inquiries.width,
      thickness: inquiries.thickness,
      dimensionNotes: inquiries.dimensionNotes,
      contactFirstName: inquiries.contactFirstName,
      contactLastName: inquiries.contactLastName,
      contactNo: inquiries.contactNo,
      contactEmail: inquiries.contactEmail,
    })
    .from(inquiries)
    .leftJoin(employees, eq(inquiries.assignedSalesPersonId, employees.id))
    .leftJoin(grade, eq(inquiries.gradeId, grade.id))
    .leftJoin(tolerance, eq(inquiries.toleranceId, tolerance.id))
    .leftJoin(condition, eq(inquiries.conditionId, condition.id))
    .where(eq(inquiries.id, inquiryId))
    .limit(1);
  return row ?? null;
}

/**
 * Quotation auto-fetch for the Negotiation / Sales-Order "Linked Quotation"
 * picker: pre-fills price/timeline/validity/link from the chosen quote.
 */
export interface QuotationAutofill {
  partNo: string | null;
  finalCost: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  quotationLink: string | null;
}

export async function getQuotationAutofill(
  quotationId: string,
): Promise<QuotationAutofill | null> {
  const [row] = await db
    .select({
      partNo: quotations.partNo,
      finalCost: quotations.finalCost,
      quotePrice: quotations.quotePrice,
      developmentTime: quotations.developmentTime,
      deliveryTime: quotations.deliveryTime,
      validity: quotations.validity,
      quotationLink: quotations.quotationLink,
    })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  return row ?? null;
}

/** One option of the Negotiation / SO "Linked Quotation" picker. */
export interface QuotationOption {
  id: string;
  quoteNo: string;
  companyName: string | null;
}

/**
 * Recent quotations for the Negotiation / SO quotation pickers. Intentionally
 * uncached (like listInquiryOptions): a negotiation is logged minutes after
 * the quote, so a cached list would routinely miss the freshest quote. Capped
 * at the 100 most recent.
 */
export async function listQuotationOptions(): Promise<QuotationOption[]> {
  return db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      companyName: quotations.companyName,
    })
    .from(quotations)
    .orderBy(desc(quotations.createdAt))
    .limit(100);
}

/**
 * One quote-line seed per `inquiry_items` row of an SM — used to pre-fill the
 * Quotation form's per-line editor when the SM is picked. Resolves the
 * tolerance/condition master ids → their display names via two aliased LEFT
 * JOINs (same row type as the grade alias, so aliasing is required), ordered by
 * the product's sort order. `gradeCustomer` is the raw free-text from the line;
 * `inquiryItemId`/`itemId` carry the source product + its linked Item (if any).
 */
export interface QuoteLineSeed {
  inquiryItemId: string;
  itemId: string | null;
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
  qty: string | null;
  gradeCustomer: string | null;
  tolerance: string | null;
  condition: string | null;
  /** Final cost per piece from the chosen costing (if one exists). */
  finalCost: string | null;
}

export async function getInquiryItemSeeds(
  inquiryId: string,
): Promise<QuoteLineSeed[]> {
  const tolerance = alias(masterOptions, "tolerance");
  const condition = alias(masterOptions, "condition");
  const chosen = alias(costings, "chosen_costing");

  return db
    .select({
      inquiryItemId: inquiryItems.id,
      itemId: inquiryItems.itemId,
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      drawingRevisionNo: inquiryItems.drawingRevisionNo,
      qty: inquiryItems.quantityNos,
      gradeCustomer: inquiryItems.gradeCustomer,
      tolerance: tolerance.name,
      condition: condition.name,
      finalCost: chosen.finalCostPerPiece,
    })
    .from(inquiryItems)
    .leftJoin(tolerance, eq(inquiryItems.toleranceId, tolerance.id))
    .leftJoin(condition, eq(inquiryItems.conditionId, condition.id))
    .leftJoin(
      chosen,
      and(
        eq(chosen.inquiryItemId, inquiryItems.id),
        eq(chosen.isChosen, true),
      ),
    )
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));
}

/** All line items for a quotation, in sort order. */
export async function getQuotationItems(quotationId: string) {
  return db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId))
    .orderBy(asc(quotationItems.sortOrder));
}
