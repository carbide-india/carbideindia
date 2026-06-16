import type { ImportSpec } from "@/lib/import/engine/spec";

export const negotiationImportSpec: ImportSpec = {
  formKey: "negotiation", title: "Negotiation", basePath: "/negotiations",
  fields: [
    { key: "inquiryId", header: "SM Number", type: "ref", required: true, ref: { kind: "inquirySM" }, example: "SM9579" },
    { key: "custProductName", header: "Customer Product Name", type: "text", maxLen: 240 },
    { key: "partNo", header: "Part No", type: "text", maxLen: 120 },
    { key: "qty", header: "Quantity", type: "number", example: "100" },
    { key: "finalCost", header: "Final Cost", type: "number" },
    { key: "negotiation", header: "Negotiation", type: "number" },
    { key: "quotePrice", header: "Quote Price", type: "number" },
    { key: "developmentTime", header: "Development Time", type: "text", maxLen: 120 },
    { key: "deliveryTime", header: "Delivery Time", type: "text", maxLen: 120 },
    { key: "validity", header: "Validity", type: "text", maxLen: 120 },
    { key: "negotiationNotes", header: "Negotiation Notes", type: "text", maxLen: 2000 },
  ],
};
