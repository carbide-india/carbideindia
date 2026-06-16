import type { ImportSpec } from "@/lib/import/engine/spec";

export const sampleImportSpec: ImportSpec = {
  formKey: "sample", title: "Sample", basePath: "/samples",
  fields: [
    { key: "inquiryId", header: "SM Number", type: "ref", required: true, ref: { kind: "inquirySM" }, example: "SM9579" },
    { key: "sampleNo", header: "Sample No", type: "text", example: "(auto if blank)", maxLen: 60 },
    { key: "location", header: "Location", type: "text", example: "AYK Cabin", maxLen: 80 },
    { key: "responsiblePersonId", header: "Responsible Person", type: "ref", ref: { kind: "employee" }, example: "Piyush Bagde" },
    { key: "sampleNotes", header: "Sample Notes", type: "text", maxLen: 2000 },
  ],
};
