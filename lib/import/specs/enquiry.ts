import type { ImportSpec } from "@/lib/import/engine/spec";
import {
  INQUIRY_PRIORITIES, INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCES, INQUIRY_SOURCE_LABELS,
} from "@/db/enums";

const priorityEnum = INQUIRY_PRIORITIES.map((v) => ({ value: v, label: INQUIRY_PRIORITY_LABELS[v] }));
const sourceEnum = INQUIRY_SOURCES.map((v) => ({ value: v, label: INQUIRY_SOURCE_LABELS[v] }));

export const enquiryImportSpec: ImportSpec = {
  formKey: "enquiry",
  title: "Enquiry",
  basePath: "/inquiries",
  fields: [
    { key: "companyName", header: "Company Name", type: "text", required: true, example: "Acme Ltd", maxLen: 200 },
    { key: "priority", header: "Priority", type: "enum", enumValues: priorityEnum, example: "Normal" },
    { key: "source", header: "Source", type: "enum", enumValues: sourceEnum, example: "Email" },
    { key: "export", header: "Export", type: "boolean", example: "No" },
    { key: "state", header: "State", type: "text", maxLen: 80 },
    { key: "city", header: "City", type: "text", maxLen: 80 },
    { key: "addressLine1", header: "Address 1", type: "text", maxLen: 240 },
    { key: "pinCode", header: "Pin Code", type: "text", maxLen: 20 },
    { key: "contactFirstName", header: "Contact First Name", type: "text", maxLen: 80 },
    { key: "contactLastName", header: "Contact Last Name", type: "text", maxLen: 80 },
    { key: "contactNo", header: "Contact No", type: "text", maxLen: 40 },
    { key: "contactEmail", header: "Contact Email", type: "text", maxLen: 160 },
    { key: "productDescription", header: "Product Description", type: "text", required: true, example: "Tungsten carbide insert" },
    { key: "quantityNos", header: "Quantity", type: "number", example: "100", min: 1 },
    { key: "gradeId", header: "Grade", type: "ref", ref: { kind: "grade", allowCreate: true }, example: "WC10" },
    { key: "toleranceId", header: "Tolerance", type: "ref", ref: { kind: "tolerance", allowCreate: true }, example: "h6" },
    { key: "conditionId", header: "Condition", type: "ref", ref: { kind: "condition", allowCreate: true }, example: "Sintered" },
    { key: "assignedSalesPersonId", header: "Sales Person", type: "ref", ref: { kind: "employee" }, example: "Piyush Bagde" },
    { key: "enquiryNotes", header: "Enquiry Notes", type: "text", maxLen: 2000 },
  ],
};
