import type { ImportSpec } from "@/lib/import/engine/spec";

export const salesOrderImportSpec: ImportSpec = {
  formKey: "salesOrder", title: "Sales Order", basePath: "/sales-orders",
  fields: [
    { key: "inquiryId", header: "SM Number", type: "ref", required: true, ref: { kind: "inquirySM" }, example: "SM9579" },
    { key: "custProductName", header: "Customer Product Name", type: "text", maxLen: 240 },
    { key: "partNo", header: "Part No", type: "text", maxLen: 120 },
    { key: "qty", header: "Quantity", type: "number", example: "100" },
    { key: "quotePrice", header: "Quote Price", type: "number" },
    { key: "developmentTime", header: "Development Time", type: "text", maxLen: 120 },
    { key: "deliveryTime", header: "Delivery Time", type: "text", maxLen: 120 },
    { key: "validity", header: "Validity", type: "text", maxLen: 120 },
    { key: "customerPoNo", header: "Customer PO No", type: "text", maxLen: 120 },
    { key: "customerPoDate", header: "Customer PO Date", type: "date" },
  ],
};
