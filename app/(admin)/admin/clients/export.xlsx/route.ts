import * as XLSX from "xlsx";
import { asc, eq, getTableColumns, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { clientContacts, clients, employees, masterOptions } from "@/db/schema";
import { GST_REGISTRATION_TYPE_LABELS } from "@/db/enums";

/**
 * GET /admin/clients/export.xlsx
 *
 * Admin-only XLSX export of the full Client Master. Columns are humanized
 * (Active/Inactive, Yes/No for export flag, comma-joined arrays, YYYY-MM-DD dates).
 * Sheet name: "Clients". Filename: client-master.xlsx.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  // ── 1. Fetch all clients ──
  const rows = await db
    .select({ ...getTableColumns(clients) })
    .from(clients)
    .orderBy(asc(clients.name));

  // ── 2. Collect all unique master-option IDs (customer / industry / product
  //       types all reference master_options) + resolve names in one batch ──
  const allTypeIds = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.customerTypeIds ?? []),
        ...(r.industryTypeIds ?? []),
        ...(r.productTypeIds ?? []),
      ]),
    ),
  ];
  const typeNameMap = new Map<string, string>();
  if (allTypeIds.length > 0) {
    const optRows = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(inArray(masterOptions.id, allTypeIds));
    for (const o of optRows) typeNameMap.set(o.id, o.name);
  }
  const joinNames = (ids: string[] | null | undefined): string =>
    (ids ?? [])
      .map((id) => typeNameMap.get(id))
      .filter((n): n is string => n !== undefined)
      .join(", ");

  // ── 3. Collect all unique sales-person IDs + resolve names in one batch ──
  const allSpIds = [
    ...new Set(
      rows.map((r) => r.kycSalesPersonId).filter((id): id is string => id != null),
    ),
  ];
  const salesPersonNameMap = new Map<string, string>();
  if (allSpIds.length > 0) {
    const spRows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, allSpIds));
    for (const sp of spRows) salesPersonNameMap.set(sp.id, sp.name);
  }

  // ── 4. Fetch primary contacts for all clients in one batch ──
  const allClientIds = rows.map((r) => r.id);
  const primaryContactMap = new Map<
    string,
    { firstName: string; lastName: string | null; designation: string | null; contactNo: string | null; email: string | null }
  >();
  if (allClientIds.length > 0) {
    const contactRows = await db
      .select({
        clientId: clientContacts.clientId,
        firstName: clientContacts.firstName,
        lastName: clientContacts.lastName,
        designation: clientContacts.designation,
        contactNo: clientContacts.contactNo,
        email: clientContacts.email,
      })
      .from(clientContacts)
      .where(eq(clientContacts.isPrimary, true));
    for (const c of contactRows) primaryContactMap.set(c.clientId, c);
  }

  // ── 5. Build AOA ──
  const HEADERS = [
    "Client Code",
    "Company Name",
    "Status",
    "Customer Type",
    "Industry Type",
    "Product Types",
    "Tags",
    "City",
    "State",
    "Country",
    "Pin Code",
    "GSTIN",
    "PAN",
    "MSME/Udyam",
    "GST Registration Type",
    "Place of Supply",
    "Is Transporter",
    "Bill To",
    "Ship To",
    "Payment Terms",
    "Credit Days",
    "Credit Limit",
    "Freight Charges",
    "Transporter",
    "Qty Deviation",
    "Currency",
    "Export",
    "Other References",
    "Bank Name",
    "Account No",
    "IFSC",
    "Branch",
    "Account Holder",
    "Primary Contact",
    "Contact Designation",
    "Contact No",
    "Contact Email",
    "Sales Person",
    "Notes",
    "Created At",
  ];

  const dataRows = rows.map((r) => {
    const contact = primaryContactMap.get(r.id);
    const primaryContactName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
      : "";
    const customerTypeNames = joinNames(r.customerTypeIds);
    const industryTypeNames = joinNames(r.industryTypeIds);
    const productTypeNames = joinNames(r.productTypeIds);
    const tags = (r.tags ?? []).join(", ");
    const salesPersonName = r.kycSalesPersonId
      ? (salesPersonNameMap.get(r.kycSalesPersonId) ?? "")
      : "";
    const exportFlag =
      r.export === true ? "Yes" : r.export === false ? "No" : "";
    const createdAt = r.createdAt
      ? r.createdAt.toISOString().slice(0, 10)
      : "";
    const creditLimit =
      r.creditLimit != null ? Number(r.creditLimit) : "";
    const gstRegistrationType = r.gstRegistrationType
      ? GST_REGISTRATION_TYPE_LABELS[r.gstRegistrationType]
      : "";
    const isTransporter =
      r.isTransporter === true ? "Yes" : r.isTransporter === false ? "No" : "";

    return [
      r.clientCode ?? "",
      r.name,
      r.isActive ? "Active" : "Inactive",
      customerTypeNames,
      industryTypeNames,
      productTypeNames,
      tags,
      r.city ?? "",
      r.state ?? "",
      r.country ?? "",
      r.pinCode ?? "",
      r.gstin ?? "",
      r.panNo ?? "",
      r.msmeUdyamNo ?? "",
      gstRegistrationType,
      r.placeOfSupply ?? "",
      isTransporter,
      r.billToAddress ?? "",
      r.shipToAddress ?? "",
      r.paymentTerms ?? "",
      r.creditDays ?? "",
      creditLimit,
      r.freightCharges ?? "",
      r.transporter ?? "",
      r.qtyDeviation ?? "",
      r.currency ?? "",
      exportFlag,
      r.otherReferences ?? "",
      r.bankName ?? "",
      r.bankAccountNo ?? "",
      r.bankIfsc ?? "",
      r.bankBranch ?? "",
      r.bankAccountHolder ?? "",
      primaryContactName,
      contact?.designation ?? "",
      contact?.contactNo ?? "",
      contact?.email ?? "",
      salesPersonName,
      r.notes ?? "",
      createdAt,
    ];
  });

  const aoa: (string | number)[][] = [HEADERS, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 12 }, // Client Code
    { wch: 30 }, // Company Name
    { wch: 10 }, // Status
    { wch: 18 }, // Customer Type
    { wch: 18 }, // Industry Type
    { wch: 28 }, // Product Types
    { wch: 20 }, // Tags
    { wch: 16 }, // City
    { wch: 16 }, // State
    { wch: 14 }, // Country
    { wch: 10 }, // Pin Code
    { wch: 18 }, // GSTIN
    { wch: 14 }, // PAN
    { wch: 20 }, // MSME/Udyam
    { wch: 22 }, // GST Registration Type
    { wch: 18 }, // Place of Supply
    { wch: 14 }, // Is Transporter
    { wch: 30 }, // Bill To
    { wch: 30 }, // Ship To
    { wch: 18 }, // Payment Terms
    { wch: 12 }, // Credit Days
    { wch: 14 }, // Credit Limit
    { wch: 16 }, // Freight Charges
    { wch: 20 }, // Transporter
    { wch: 14 }, // Qty Deviation
    { wch: 10 }, // Currency
    { wch: 8 },  // Export
    { wch: 24 }, // Other References
    { wch: 22 }, // Bank Name
    { wch: 20 }, // Account No
    { wch: 14 }, // IFSC
    { wch: 18 }, // Branch
    { wch: 24 }, // Account Holder
    { wch: 24 }, // Primary Contact
    { wch: 20 }, // Contact Designation
    { wch: 16 }, // Contact No
    { wch: 28 }, // Contact Email
    { wch: 22 }, // Sales Person
    { wch: 40 }, // Notes
    { wch: 12 }, // Created At
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="client-master.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
