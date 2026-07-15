import {
  GST_REGISTRATION_TYPE_LABELS,
  ADDRESS_TYPE_LABELS,
  type GstRegistrationType,
  type AddressType,
} from "@/db/enums";
import type { ClientRecord } from "@/lib/queries/clients";

/**
 * Turns a full ClientRecord into an ordered, presentation-ready list of
 * sections + labelled rows. Both the PDF (pdfkit) and Word (docx) exporters
 * consume THIS so the two downloads always show the exact same fields in the
 * same order - the single source of truth for the KYC document layout.
 */

export interface KycDocRow {
  label: string;
  value: string;
}
export interface KycDocSection {
  title: string;
  /** Simple label/value rows. */
  rows?: KycDocRow[];
  /** Repeating blocks (contacts, addresses, banks) each with their own rows. */
  blocks?: { heading: string; rows: KycDocRow[] }[];
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function joinName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

/** Keep only rows with a non-empty value. */
function rows(list: Array<[string, string | null | undefined]>): KycDocRow[] {
  return list
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([label, v]) => ({ label, value: String(v) }));
}

export interface KycDoc {
  clientName: string;
  clientCode: string;
  status: string;
  gstin: string;
  sections: KycDocSection[];
}

export function buildKycDocument(rec: ClientRecord): KycDoc {
  const sections: KycDocSection[] = [];

  const push = (title: string, section: Omit<KycDocSection, "title">) => {
    const hasRows = (section.rows?.length ?? 0) > 0;
    const hasBlocks = (section.blocks ?? []).some((b) => b.rows.length > 0);
    if (hasRows || hasBlocks) sections.push({ title, ...section });
  };

  push("Identity & Classification", {
    rows: rows([
      ["Company Name", rec.name],
      ["Client Code", rec.clientCode],
      ["Status", rec.isActive ? "Active" : "Inactive"],
      ["Grade", rec.grade],
      ["Sales Person", rec.salesPersonName],
      ["Export", rec.export == null ? "" : rec.export ? "Yes" : "No"],
      ["Customer Type", rec.customerTypeNames.join(", ")],
      ["Industry Type", rec.industryTypeNames.join(", ")],
      ["Product Types", rec.productTypeNames.join(", ")],
      ["Tags", (rec.tags ?? []).join(", ")],
    ]),
  });

  push("Registration & Tax", {
    rows: rows([
      ["GSTIN", rec.gstin],
      ["PAN / IT No", rec.panNo],
      ["MSME / Udyam No", rec.msmeUdyamNo],
      [
        "GST Registration Type",
        rec.gstRegistrationType
          ? GST_REGISTRATION_TYPE_LABELS[rec.gstRegistrationType as GstRegistrationType]
          : "",
      ],
      ["Place of Supply", rec.placeOfSupply],
      ["Currency", rec.currency],
      ["Country", rec.country],
      ["State", rec.state],
      ["City", rec.city],
      ["Pin Code", rec.pinCode],
    ]),
  });

  const primary = rec.contacts.find((c) => c.isPrimary) ?? rec.contacts[0];
  if (primary) {
    push("Primary Contact", {
      rows: rows([
        ["Name", joinName(primary.firstName, primary.lastName)],
        ["Designation", primary.designation],
        ["Contact No", primary.contactNo],
        ["Email", primary.email],
        ["Notes", primary.notes],
      ]),
    });
  }

  const additional = rec.contacts.filter((c) => c !== primary);
  if (additional.length > 0) {
    push("Additional Contacts", {
      blocks: additional.map((c, i) => ({
        heading: joinName(c.firstName, c.lastName) || `Contact ${i + 2}`,
        rows: rows([
          ["Designation", c.designation],
          ["Contact No", c.contactNo],
          ["Email", c.email],
          ["Notes", c.notes],
        ]),
      })),
    });
  }

  if (rec.addresses.length > 0) {
    push("Addresses", {
      blocks: rec.addresses.map((a, i) => ({
        heading:
          a.label ||
          (a.addressType
            ? ADDRESS_TYPE_LABELS[a.addressType as AddressType] ?? a.addressType
            : `Address ${i + 1}`) + (a.isPrimary ? " · Primary" : ""),
        rows: rows([
          ["Address", [a.line1, a.line2, a.line3, a.line4].filter(Boolean).join(", ")],
          ["City", a.city],
          ["State", a.state],
          ["Country", a.country],
          ["Pin Code", a.pinCode],
          ["GSTIN", a.gstin],
        ]),
      })),
    });
  }

  push("Commercial & Credit", {
    rows: rows([
      ["Payment Terms", rec.paymentTerms],
      ["Freight Charges", rec.freightCharges],
      ["Quantity Deviation", rec.qtyDeviation],
      ["Credit Days", rec.creditDays != null ? String(rec.creditDays) : ""],
      ["Credit Limit", rec.creditLimit != null ? `₹${Number(rec.creditLimit).toLocaleString("en-IN")}` : ""],
      ["Transporter", rec.transporter],
      ["Bill To", rec.billToAddress],
      ["Ship To", rec.shipToAddress],
      ["Other References", rec.otherReferences],
    ]),
  });

  if (rec.bankAccounts.length > 0) {
    push("Bank Details", {
      blocks: rec.bankAccounts.map((b, i) => ({
        heading: (b.bankName || `Account ${i + 1}`) + (b.isPrimary ? " · Primary" : ""),
        rows: rows([
          ["Account Holder", b.accountHolder],
          ["Account No", b.accountNo],
          ["IFSC / SWIFT", b.ifsc],
          ["Branch", b.branch],
          ["Account Type", b.accountType],
        ]),
      })),
    });
  } else {
    push("Bank Details", {
      rows: rows([
        ["Bank Name", rec.bankName],
        ["Account No", rec.bankAccountNo],
        ["IFSC", rec.bankIfsc],
        ["Branch", rec.bankBranch],
        ["Account Holder", rec.bankAccountHolder],
      ]),
    });
  }

  push("KYC Meeting", {
    rows: rows([
      ["Meeting Date", fmtDate(rec.kycMeetingDate)],
      ["Start", rec.kycMeetingStart],
      ["End", rec.kycMeetingEnd],
      ["Sales Person", rec.salesPersonName],
      ["Meeting Notes", rec.kycMeetingNotes],
    ]),
  });

  push("Notes", { rows: rows([["General Notes", rec.notes]]) });

  return {
    clientName: rec.name,
    clientCode: rec.clientCode ?? "",
    status: rec.isActive ? "Active" : "Inactive",
    gstin: rec.gstin ?? "",
    sections,
  };
}

/** A filesystem-safe filename stem for the downloads. */
export function kycFileStem(rec: { name: string; clientCode?: string | null }): string {
  const base = [rec.clientCode, rec.name].filter(Boolean).join("-") || "client";
  return `KYC-${base}`.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 80);
}
