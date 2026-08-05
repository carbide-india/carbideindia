import "server-only";
import * as XLSX from "xlsx";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, type Table } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientMeetings,
  clients,
  employees,
  employeeEvents,
  inquiries,
  items,
  masterOptions,
  negotiations,
  quotations,
  salesOrders,
  samples,
  settingsEvents,
  tasks,
  taskEvents,
  vendors,
} from "@/db/schema";
import {
  CHECK_STATE_LABELS,
  COSTING_DONE_STATUS_LABELS,
  ENQUIRY_STATUS_LABELS,
  FEASIBILITY_STATUS_LABELS,
  INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCE_LABELS,
  MEETING_PURPOSE_LABELS,
  NEGOTIATION_STAGE_LABELS,
  NEGOTIATION_STATUS_LABELS,
  RECHECK_STATE_LABELS,
  SAMPLE_STATUS_LABELS,
  type DataJobFormat,
} from "@/db/enums";
import type { ExportEntityKey } from "@/lib/data-transfer/catalog";

/** One generated dataset, ready to be turned into a CSV or XLSX response. */
export interface ExportDataset {
  /** Worksheet name (XLSX) - Excel caps these at 31 characters. */
  sheet: string;
  headers: string[];
  rows: (string | number)[][];
}

type Cell = string | number | null | undefined | boolean | Date;

/** Humanise one cell: dates → YYYY-MM-DD, booleans → Yes/No, null → "". */
function cell(v: Cell): string | number {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v;
}

/** Numeric columns come back as strings from postgres-js - keep them numeric. */
function num(v: string | number | null | undefined): string | number {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

// ── Per-entity builders ────────────────────────────────────────────

async function buildEnquiries(): Promise<ExportDataset> {
  const grade = alias(masterOptions, "mo_grade");
  const tolerance = alias(masterOptions, "mo_tolerance");
  const condition = alias(masterOptions, "mo_condition");
  const dept = alias(masterOptions, "mo_dept");
  const salesPerson = alias(employees, "emp_sales");
  const feasBy = alias(employees, "emp_feas");

  const rows = await db
    .select({
      smNumber: inquiries.smNumber,
      enquiryDate: inquiries.enquiryDate,
      companyName: inquiries.companyName,
      priority: inquiries.priority,
      source: inquiries.source,
      enquiryStatus: inquiries.enquiryStatus,
      feasibilityStatus: inquiries.feasibilityStatus,
      productDescription: inquiries.productDescription,
      quantityNos: inquiries.quantityNos,
      quantityUom: inquiries.quantityUom,
      shape: inquiries.shape,
      outerDia: inquiries.outerDia,
      innerDia: inquiries.innerDia,
      length: inquiries.length,
      width: inquiries.width,
      thickness: inquiries.thickness,
      gradeName: grade.name,
      toleranceName: tolerance.name,
      conditionName: condition.name,
      quantityStatus: inquiries.quantityStatus,
      shapeDimensionCheck: inquiries.shapeDimensionCheck,
      gradeCheck: inquiries.gradeCheck,
      toleranceCheck: inquiries.toleranceCheck,
      conditionCheck: inquiries.conditionCheck,
      feasSizeDrawingCheck: inquiries.feasSizeDrawingCheck,
      feasToleranceCheck: inquiries.feasToleranceCheck,
      feasGradeAppCheck: inquiries.feasGradeAppCheck,
      feasQuantityCheck: inquiries.feasQuantityCheck,
      feasConditionCheck: inquiries.feasConditionCheck,
      feasibilityCheckedBy: feasBy.name,
      export: inquiries.export,
      firstEnquiry: inquiries.firstEnquiry,
      currency: inquiries.currency,
      country: inquiries.country,
      state: inquiries.state,
      city: inquiries.city,
      pinCode: inquiries.pinCode,
      contactFirstName: inquiries.contactFirstName,
      contactLastName: inquiries.contactLastName,
      contactNo: inquiries.contactNo,
      contactEmail: inquiries.contactEmail,
      salesPersonName: salesPerson.name,
      departmentName: dept.name,
      enquiryNotes: inquiries.enquiryNotes,
      isArchived: inquiries.isArchived,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .leftJoin(grade, eq(inquiries.gradeId, grade.id))
    .leftJoin(tolerance, eq(inquiries.toleranceId, tolerance.id))
    .leftJoin(condition, eq(inquiries.conditionId, condition.id))
    .leftJoin(dept, eq(inquiries.departmentId, dept.id))
    .leftJoin(salesPerson, eq(inquiries.assignedSalesPersonId, salesPerson.id))
    .leftJoin(feasBy, eq(inquiries.feasibilityCheckedById, feasBy.id))
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt));

  return {
    sheet: "Enquiries",
    headers: [
      "SM Number", "Enquiry Date", "Company", "Priority", "Source",
      "Enquiry Status", "Feasibility Status", "Product Description",
      "Quantity", "UoM", "Shape", "Outer Dia", "Inner Dia", "Length",
      "Width", "Thickness", "Grade", "Tolerance", "Condition",
      "Qty Check", "Shape/Dimension Check", "Grade Check", "Tolerance Check",
      "Condition Check", "Feas: Size & Drawing", "Feas: Tolerance",
      "Feas: Grade/Application", "Feas: Quantity", "Feas: Condition",
      "Feasibility Checked By", "Export", "First Enquiry", "Currency",
      "Country", "State", "City", "Pin Code", "Contact First Name",
      "Contact Last Name", "Contact No", "Contact Email", "Sales Person",
      "Department", "Enquiry Notes", "Archived", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.smNumber), cell(r.enquiryDate), cell(r.companyName),
      INQUIRY_PRIORITY_LABELS[r.priority],
      r.source ? INQUIRY_SOURCE_LABELS[r.source] : "",
      ENQUIRY_STATUS_LABELS[r.enquiryStatus],
      FEASIBILITY_STATUS_LABELS[r.feasibilityStatus],
      cell(r.productDescription), num(r.quantityNos), cell(r.quantityUom),
      cell(r.shape), num(r.outerDia), num(r.innerDia), num(r.length),
      num(r.width), num(r.thickness), cell(r.gradeName),
      cell(r.toleranceName), cell(r.conditionName),
      r.quantityStatus ? CHECK_STATE_LABELS[r.quantityStatus] : "",
      r.shapeDimensionCheck ? CHECK_STATE_LABELS[r.shapeDimensionCheck] : "",
      r.gradeCheck ? CHECK_STATE_LABELS[r.gradeCheck] : "",
      r.toleranceCheck ? CHECK_STATE_LABELS[r.toleranceCheck] : "",
      r.conditionCheck ? CHECK_STATE_LABELS[r.conditionCheck] : "",
      RECHECK_STATE_LABELS[r.feasSizeDrawingCheck],
      RECHECK_STATE_LABELS[r.feasToleranceCheck],
      RECHECK_STATE_LABELS[r.feasGradeAppCheck],
      RECHECK_STATE_LABELS[r.feasQuantityCheck],
      RECHECK_STATE_LABELS[r.feasConditionCheck],
      cell(r.feasibilityCheckedBy), cell(r.export), cell(r.firstEnquiry),
      cell(r.currency), cell(r.country), cell(r.state), cell(r.city),
      cell(r.pinCode), cell(r.contactFirstName), cell(r.contactLastName),
      cell(r.contactNo), cell(r.contactEmail), cell(r.salesPersonName),
      cell(r.departmentName), cell(r.enquiryNotes), cell(r.isArchived),
      cell(r.createdAt),
    ]),
  };
}

async function buildSamples(): Promise<ExportDataset> {
  const rows = await db
    .select({
      sampleNo: samples.sampleNo,
      sampleDate: samples.sampleDate,
      smNumber: inquiries.smNumber,
      clientName: clients.name,
      itemCode: items.itemCode,
      location: samples.location,
      responsiblePerson: employees.name,
      sampleStatus: samples.sampleStatus,
      dimensionStatus: samples.dimensionStatus,
      dimensionLocation: samples.dimensionLocation,
      dimensionCompletedOn: samples.dimensionCompletedOn,
      chemicalStatus: samples.chemicalStatus,
      chemicalLocation: samples.chemicalLocation,
      chemicalCompletedOn: samples.chemicalCompletedOn,
      drawingStatus: samples.drawingStatus,
      drawingLocation: samples.drawingLocation,
      drawingCompletedOn: samples.drawingCompletedOn,
      costingStatus: samples.costingStatus,
      costingCompletedOn: samples.costingCompletedOn,
      reportsInSmFolder: samples.reportsInSmFolder,
      processedDate: samples.processedDate,
      sampleNotes: samples.sampleNotes,
      createdAt: samples.createdAt,
    })
    .from(samples)
    .leftJoin(inquiries, eq(samples.inquiryId, inquiries.id))
    .leftJoin(clients, eq(samples.clientId, clients.id))
    .leftJoin(items, eq(samples.itemId, items.id))
    .leftJoin(employees, eq(samples.responsiblePersonId, employees.id))
    .orderBy(desc(samples.sampleDate), desc(samples.createdAt));

  return {
    sheet: "Samples",
    headers: [
      "Sample No", "Sample Date", "SM Number", "Client", "Item Code",
      "Location", "Responsible Person", "Sample Status",
      "Dimension Status", "Dimension Location", "Dimension Completed",
      "Chemical Status", "Chemical Location", "Chemical Completed",
      "Drawing Status", "Drawing Location", "Drawing Completed",
      "Costing Status", "Costing Completed", "Reports In SM Folder",
      "Processed Date", "Sample Notes", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.sampleNo), cell(r.sampleDate), cell(r.smNumber),
      cell(r.clientName), cell(r.itemCode), cell(r.location),
      cell(r.responsiblePerson), SAMPLE_STATUS_LABELS[r.sampleStatus],
      cell(r.dimensionStatus), cell(r.dimensionLocation),
      cell(r.dimensionCompletedOn), cell(r.chemicalStatus),
      cell(r.chemicalLocation), cell(r.chemicalCompletedOn),
      cell(r.drawingStatus), cell(r.drawingLocation),
      cell(r.drawingCompletedOn), cell(r.costingStatus),
      cell(r.costingCompletedOn), cell(r.reportsInSmFolder),
      cell(r.processedDate), cell(r.sampleNotes), cell(r.createdAt),
    ]),
  };
}

async function buildMeetings(): Promise<ExportDataset> {
  const rows = await db
    .select({
      meetingNo: clientMeetings.meetingNo,
      meetingDate: clientMeetings.meetingDate,
      companyName: clientMeetings.companyName,
      clientCode: clients.clientCode,
      salesName: clientMeetings.salesName,
      salesPersonName: employees.name,
      salesNumber: clientMeetings.salesNumber,
      salesDesignation: clientMeetings.salesDesignation,
      salesEmail: clientMeetings.salesEmail,
      contactPersonName: clientMeetings.contactPersonName,
      contactPersonDesignation: clientMeetings.contactPersonDesignation,
      contactNumber: clientMeetings.contactNumber,
      contactEmail: clientMeetings.contactEmail,
      meetingStartTime: clientMeetings.meetingStartTime,
      meetingEndTime: clientMeetings.meetingEndTime,
      meetingSource: clientMeetings.meetingSource,
      clientType: clientMeetings.clientType,
      purpose: clientMeetings.purpose,
      purposeOther: clientMeetings.purposeOther,
      meetingNotes: clientMeetings.meetingNotes,
      nextFollowUpDate: clientMeetings.nextFollowUpDate,
      createdAt: clientMeetings.createdAt,
    })
    .from(clientMeetings)
    .leftJoin(clients, eq(clientMeetings.clientId, clients.id))
    .leftJoin(employees, eq(clientMeetings.salesPersonId, employees.id))
    .orderBy(desc(clientMeetings.meetingDate));

  return {
    sheet: "Meetings",
    headers: [
      "Meeting No", "Meeting Date", "Company", "Client Code", "Sales Name",
      "Sales Person (linked)", "Sales Number", "Sales Designation",
      "Sales Email", "Contact Person", "Contact Designation",
      "Contact Number", "Contact Email", "Start Time", "End Time",
      "Meeting Source", "Client Type", "Purpose", "Purpose (other)",
      "Meeting Notes", "Next Follow-up", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.meetingNo), cell(r.meetingDate), cell(r.companyName),
      cell(r.clientCode), cell(r.salesName), cell(r.salesPersonName),
      cell(r.salesNumber), cell(r.salesDesignation), cell(r.salesEmail),
      cell(r.contactPersonName), cell(r.contactPersonDesignation),
      cell(r.contactNumber), cell(r.contactEmail), cell(r.meetingStartTime),
      cell(r.meetingEndTime), cell(r.meetingSource), cell(r.clientType),
      MEETING_PURPOSE_LABELS[r.purpose], cell(r.purposeOther),
      cell(r.meetingNotes), cell(r.nextFollowUpDate), cell(r.createdAt),
    ]),
  };
}

async function buildQuotations(): Promise<ExportDataset> {
  const rows = await db
    .select({
      quoteNo: quotations.quoteNo,
      smNumber: inquiries.smNumber,
      companyName: quotations.companyName,
      enquiryDate: quotations.enquiryDate,
      custProductName: quotations.custProductName,
      partNo: quotations.partNo,
      custDrawingNo: quotations.custDrawingNo,
      drawingRevisionNo: quotations.drawingRevisionNo,
      qty: quotations.qty,
      gradeNameForCust: quotations.gradeNameForCust,
      gradeCustomer: quotations.gradeCustomer,
      tolerance: quotations.tolerance,
      condition: quotations.condition,
      finalCost: quotations.finalCost,
      negotiation: quotations.negotiation,
      quotePrice: quotations.quotePrice,
      developmentTime: quotations.developmentTime,
      deliveryTime: quotations.deliveryTime,
      validity: quotations.validity,
      costingDoneStatus: quotations.costingDoneStatus,
      quoteSent: quotations.quoteSent,
      createdBy: employees.name,
      createdAt: quotations.createdAt,
    })
    .from(quotations)
    .leftJoin(inquiries, eq(quotations.inquiryId, inquiries.id))
    .leftJoin(employees, eq(quotations.createdById, employees.id))
    .orderBy(desc(quotations.createdAt));

  return {
    sheet: "Quotations",
    headers: [
      "Quote No", "SM Number", "Company", "Enquiry Date", "Product",
      "Part No", "Drawing No", "Drawing Rev", "Quantity", "Grade For Customer",
      "Customer Grade", "Tolerance", "Condition", "Final Cost", "Negotiation",
      "Quote Price", "Development Time", "Delivery Time", "Validity",
      "Costing Status", "Quote Sent", "Created By", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.quoteNo), cell(r.smNumber), cell(r.companyName),
      cell(r.enquiryDate), cell(r.custProductName), cell(r.partNo),
      cell(r.custDrawingNo), cell(r.drawingRevisionNo), num(r.qty),
      cell(r.gradeNameForCust), cell(r.gradeCustomer), cell(r.tolerance),
      cell(r.condition), num(r.finalCost), num(r.negotiation),
      num(r.quotePrice), cell(r.developmentTime), cell(r.deliveryTime),
      cell(r.validity), COSTING_DONE_STATUS_LABELS[r.costingDoneStatus],
      cell(r.quoteSent), cell(r.createdBy), cell(r.createdAt),
    ]),
  };
}

async function buildNegotiations(): Promise<ExportDataset> {
  const salesPerson = alias(employees, "emp_sales");
  const rows = await db
    .select({
      negotiationNo: negotiations.negotiationNo,
      smNumber: inquiries.smNumber,
      quoteNo: quotations.quoteNo,
      companyName: negotiations.companyName,
      enquiryDate: negotiations.enquiryDate,
      salesPersonName: salesPerson.name,
      custProductName: negotiations.custProductName,
      partNo: negotiations.partNo,
      qty: negotiations.qty,
      finalCost: negotiations.finalCost,
      negotiation: negotiations.negotiation,
      quotePrice: negotiations.quotePrice,
      developmentTime: negotiations.developmentTime,
      deliveryTime: negotiations.deliveryTime,
      validity: negotiations.validity,
      negotiationStatus: negotiations.negotiationStatus,
      negotiationStage: negotiations.negotiationStage,
      piIterationCount: negotiations.piIterationCount,
      customerPoNo: negotiations.customerPoNo,
      customerPoDate: negotiations.customerPoDate,
      poMatchStatus: negotiations.poMatchStatus,
      negotiationNotes: negotiations.negotiationNotes,
      createdAt: negotiations.createdAt,
    })
    .from(negotiations)
    .leftJoin(inquiries, eq(negotiations.inquiryId, inquiries.id))
    .leftJoin(quotations, eq(negotiations.quotationId, quotations.id))
    .leftJoin(salesPerson, eq(negotiations.salesPersonId, salesPerson.id))
    .orderBy(desc(negotiations.createdAt));

  return {
    sheet: "Negotiations",
    headers: [
      "Negotiation No", "SM Number", "Quote No", "Company", "Enquiry Date",
      "Sales Person", "Product", "Part No", "Quantity", "Final Cost",
      "Negotiation", "Quote Price", "Development Time", "Delivery Time",
      "Validity", "Status", "Stage", "PI Iterations", "Customer PO No",
      "Customer PO Date", "PO Match", "Notes", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.negotiationNo), cell(r.smNumber), cell(r.quoteNo),
      cell(r.companyName), cell(r.enquiryDate), cell(r.salesPersonName),
      cell(r.custProductName), cell(r.partNo), num(r.qty), num(r.finalCost),
      num(r.negotiation), num(r.quotePrice), cell(r.developmentTime),
      cell(r.deliveryTime), cell(r.validity),
      NEGOTIATION_STATUS_LABELS[r.negotiationStatus],
      NEGOTIATION_STAGE_LABELS[r.negotiationStage],
      r.piIterationCount, cell(r.customerPoNo), cell(r.customerPoDate),
      cell(r.poMatchStatus), cell(r.negotiationNotes), cell(r.createdAt),
    ]),
  };
}

async function buildSalesOrders(): Promise<ExportDataset> {
  const salesPerson = alias(employees, "emp_sales");
  const rows = await db
    .select({
      soNo: salesOrders.soNo,
      smNumber: inquiries.smNumber,
      quoteNo: quotations.quoteNo,
      companyName: salesOrders.companyName,
      enquiryDate: salesOrders.enquiryDate,
      salesPersonName: salesPerson.name,
      custProductName: salesOrders.custProductName,
      partNo: salesOrders.partNo,
      qty: salesOrders.qty,
      quotePrice: salesOrders.quotePrice,
      developmentTime: salesOrders.developmentTime,
      deliveryTime: salesOrders.deliveryTime,
      validity: salesOrders.validity,
      customerPoNo: salesOrders.customerPoNo,
      customerPoDate: salesOrders.customerPoDate,
      customerSoSent: salesOrders.customerSoSent,
      systemRemark: salesOrders.systemRemark,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .leftJoin(inquiries, eq(salesOrders.inquiryId, inquiries.id))
    .leftJoin(quotations, eq(salesOrders.quotationId, quotations.id))
    .leftJoin(salesPerson, eq(salesOrders.salesPersonId, salesPerson.id))
    .orderBy(desc(salesOrders.createdAt));

  return {
    sheet: "Sales Orders",
    headers: [
      "SO No", "SM Number", "Quote No", "Company", "Enquiry Date",
      "Sales Person", "Product", "Part No", "Quantity", "Quote Price",
      "Development Time", "Delivery Time", "Validity", "Customer PO No",
      "Customer PO Date", "SO Sent To Customer", "System Remark", "Created At",
    ],
    rows: rows.map((r) => [
      cell(r.soNo), cell(r.smNumber), cell(r.quoteNo), cell(r.companyName),
      cell(r.enquiryDate), cell(r.salesPersonName), cell(r.custProductName),
      cell(r.partNo), num(r.qty), num(r.quotePrice), cell(r.developmentTime),
      cell(r.deliveryTime), cell(r.validity), cell(r.customerPoNo),
      cell(r.customerPoDate), cell(r.customerSoSent), cell(r.systemRemark),
      cell(r.createdAt),
    ]),
  };
}

/** Entities this module generates itself (everything else delegates). */
const BUILDERS: Partial<Record<ExportEntityKey, () => Promise<ExportDataset>>> = {
  enquiries: buildEnquiries,
  samples: buildSamples,
  meetings: buildMeetings,
  quotations: buildQuotations,
  negotiations: buildNegotiations,
  sales_orders: buildSalesOrders,
};

export function hasBuilder(key: ExportEntityKey): boolean {
  return BUILDERS[key] !== undefined;
}

export async function buildExportDataset(
  key: ExportEntityKey,
): Promise<ExportDataset> {
  const fn = BUILDERS[key];
  if (!fn) throw new Error(`No local builder for "${key}"`);
  return fn();
}

// ── Row counts (used for the catalogue + the job log) ───────────────

async function countRows(table: Table): Promise<number> {
  return Number(await db.$count(table));
}

/**
 * Live row count per exportable dataset. Runs one cheap `count(*)` per table so
 * a fresh install renders "0 rows" instead of an empty, unexplained card.
 * `activity` is the UNION the activity export ships, so it sums its three
 * event tables.
 */
export async function getExportRowCounts(): Promise<
  Record<ExportEntityKey, number>
> {
  const [
    clientCount, itemCount, vendorCount, employeeCount, enquiryCount,
    sampleCount, meetingCount, quotationCount, negotiationCount,
    salesOrderCount, taskCount, taskEventCount, employeeEventCount,
    settingsEventCount,
  ] = await Promise.all([
    countRows(clients), countRows(items), countRows(vendors),
    countRows(employees), countRows(inquiries), countRows(samples),
    countRows(clientMeetings), countRows(quotations), countRows(negotiations),
    countRows(salesOrders), countRows(tasks), countRows(taskEvents),
    countRows(employeeEvents), countRows(settingsEvents),
  ]);

  return {
    clients: clientCount,
    items: itemCount,
    vendors: vendorCount,
    employees: employeeCount,
    enquiries: enquiryCount,
    samples: sampleCount,
    meetings: meetingCount,
    quotations: quotationCount,
    negotiations: negotiationCount,
    sales_orders: salesOrderCount,
    tasks: taskCount,
    activity: taskEventCount + employeeEventCount + settingsEventCount,
  };
}

// ── Response builders ──────────────────────────────────────────────

/** XLSX response body for a generated dataset. */
export function datasetToXlsx(dataset: ExportDataset): Uint8Array<ArrayBuffer> {
  const ws = XLSX.utils.aoa_to_sheet([dataset.headers, ...dataset.rows]);
  // Give every column a workable width - long notes columns stay readable.
  ws["!cols"] = dataset.headers.map((h) => ({
    wch: Math.min(48, Math.max(12, h.length + 4)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, dataset.sheet.slice(0, 31));
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Uint8Array(buffer);
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function contentTypeFor(format: DataJobFormat): string {
  if (format === "xlsx") return XLSX_CONTENT_TYPE;
  if (format === "json") return "application/json; charset=utf-8";
  return "text/csv; charset=utf-8";
}
