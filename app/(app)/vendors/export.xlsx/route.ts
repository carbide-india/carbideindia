import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth/current";
import { listVendors } from "@/lib/queries/vendors";

/**
 * GET /vendors/export.xlsx
 *
 * XLSX export of the full Vendor Master (Forms-module Vendors area). Columns
 * are humanized (Active/Inactive, YYYY-MM-DD dates). Sheet name: "Vendors".
 * Filename: vendor-master.xlsx.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await listVendors();

  const HEADERS = [
    "Vendor Code",
    "Name",
    "Contact Person",
    "Contact No",
    "Email",
    "Credit Days",
    "Payment Terms",
    "Status",
    "Created At",
  ];

  const dataRows = rows.map((r) => [
    r.vendorCode ?? "",
    r.name,
    r.contactPerson ?? "",
    r.contactNo ?? "",
    r.email ?? "",
    r.defaultCreditDays ?? "",
    r.paymentTerms ?? "",
    r.isActive ? "Active" : "Inactive",
    r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
  ]);

  const aoa: (string | number)[][] = [HEADERS, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 12 }, // Vendor Code
    { wch: 30 }, // Name
    { wch: 24 }, // Contact Person
    { wch: 18 }, // Contact No
    { wch: 28 }, // Email
    { wch: 12 }, // Credit Days
    { wch: 28 }, // Payment Terms
    { wch: 10 }, // Status
    { wch: 12 }, // Created At
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vendors");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="vendor-master.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
