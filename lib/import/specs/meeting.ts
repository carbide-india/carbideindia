import type { ImportSpec } from "@/lib/import/engine/spec";

export const meetingImportSpec: ImportSpec = {
  formKey: "meeting", title: "Meeting", basePath: "/meetings",
  fields: [
    { key: "salesName", header: "Sales Name", type: "text", required: true, maxLen: 120, example: "Piyush Bagde" },
    { key: "salesNumber", header: "Sales Number", type: "text", maxLen: 40 },
    { key: "salesDesignation", header: "Sales Designation", type: "text", maxLen: 120 },
    { key: "salesEmail", header: "Sales Email", type: "text", maxLen: 160 },
    { key: "companyName", header: "Company Name", type: "text", required: true, maxLen: 160, example: "Acme Ltd" },
    { key: "clientId", header: "Client", type: "ref", ref: { kind: "client" }, example: "Acme Ltd" },
    { key: "contactFirstName", header: "Contact First Name", type: "text", required: true, maxLen: 80 },
    { key: "contactLastName", header: "Contact Last Name", type: "text", maxLen: 80 },
    { key: "contactPersonDesignation", header: "Contact Designation", type: "text", maxLen: 120 },
    { key: "contactNumber", header: "Contact Number", type: "text", maxLen: 40 },
    { key: "contactEmail", header: "Contact Email", type: "text", maxLen: 160 },
    { key: "meetingDate", header: "Meeting Date", type: "date" },
    { key: "meetingSource", header: "Meeting Source", type: "text", maxLen: 80, example: "WhatsApp" },
    { key: "meetingNotes", header: "Meeting Notes", type: "text", maxLen: 2000 },
  ],
};
