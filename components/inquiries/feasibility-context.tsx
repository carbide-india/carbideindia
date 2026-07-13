"use client";

import * as React from "react";
import { Chip } from "./chip";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";
import type { Inquiry } from "@/db/schema";
import { CHECK_STATE_LABELS, type CheckState } from "@/db/enums";

const dash = (v: string | null | undefined): React.ReactNode =>
  v == null || v === "" ? <span className="text-ink-subtle">—</span> : v;

const ASSUMED_LABELS: Record<string, string> = {
  quantity: "Quantity",
  shapeDimension: "Shape & Dimension",
  grade: "Grade",
  tolerance: "Tolerance",
  condition: "Condition",
};

/**
 * Everything the enquiry captured for one product — rendered as a clean,
 * bordered specification table (identity / dimensions / grade-tolerance-
 * condition-quantity) so the feasibility check reads like a proper spec sheet.
 */
export function ProductFeasibilityContext({
  product,
  inquiry,
}: {
  product: InquiryProductCard;
  inquiry: Inquiry;
}) {
  const assumed = (inquiry.assumedValues ?? {}) as Record<string, string | undefined>;
  const assumedChips = Object.entries(assumed)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${ASSUMED_LABELS[k] ?? k}: ${v}`);
  const docs = (inquiry.docsGiven ?? []) as string[];

  const dim = (v: string | number | null | undefined): React.ReactNode =>
    v ? `${v} mm` : dash(null);
  const qty = product.quantityNos
    ? `${product.quantityNos} ${product.quantityUom}`
    : dash(null);
  const qtyStatus = inquiry.quantityStatus
    ? CHECK_STATE_LABELS[inquiry.quantityStatus as CheckState]
    : dash(null);

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[13px] [&>tbody>tr>td:last-child]:border-r-0">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[34%]" />
            <col className="w-[16%]" />
            <col className="w-[34%]" />
          </colgroup>
          <tbody>
            <SectionRow>Identity</SectionRow>
            <SpecRow pairs={[["Customer Product Name", dash(product.custProductName)], ["Item Code", dash(product.itemCode)]]} />
            <SpecRow pairs={[["Drawing No", dash(product.custDrawingNo)], ["Drawing Rev", dash(product.drawingRevisionNo)]]} />

            <SectionRow>Shape &amp; Dimensions</SectionRow>
            <SpecRow pairs={[["Shape", dash(product.shapeName)], ["Outer Dia", dim(product.outerDia)]]} />
            <SpecRow pairs={[["Inner Dia", dim(product.innerDia)], ["Length", dim(product.length)]]} />
            <SpecRow pairs={[["Width", dim(product.width)], ["Thickness", dim(product.thickness)]]} />
            {product.dimensionNotes && (
              <FullRow label="Dimension Notes">{product.dimensionNotes}</FullRow>
            )}

            <SectionRow>Grade · Tolerance · Condition · Quantity</SectionRow>
            <SpecRow pairs={[["Internal Grade", dash(product.gradeName)], ["Customer Grade", dash(product.gradeCustomer)]]} />
            <SpecRow pairs={[["Tolerance", dash(product.toleranceName)], ["Condition", dash(product.conditionName)]]} />
            <SpecRow pairs={[["Quantity", qty], ["Quantity Status", qtyStatus]]} />

            {(inquiry.productDescription || inquiry.enquiryNotes) && (
              <>
                <SectionRow>Notes</SectionRow>
                {inquiry.productDescription && (
                  <FullRow label="Product Description">{inquiry.productDescription}</FullRow>
                )}
                {inquiry.enquiryNotes && (
                  <FullRow label="Enquiry Notes">{inquiry.enquiryNotes}</FullRow>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Sample / docs / assumed chips. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Sample:</span>
        <Chip
          label={inquiry.sampleReceived ? "Received" : "Not received"}
          tone={inquiry.sampleReceived ? "green" : "slate"}
        />
        <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Docs:</span>
        {docs.length ? (
          docs.map((d) => <Chip key={d} label={d} tone="blue" />)
        ) : (
          <span className="text-[13px] text-ink-subtle">—</span>
        )}
        {assumedChips.length > 0 && (
          <>
            <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Assumed:</span>
            {assumedChips.map((c) => <Chip key={c} label={c} tone="amber" />)}
          </>
        )}
      </div>
    </div>
  );
}

/** A full-width section band inside the spec table. */
function SectionRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="border-b border-hairline bg-[#f3f4f8] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#3f3f94]"
      >
        {children}
      </td>
    </tr>
  );
}

/** A row of two label/value pairs. */
function SpecRow({ pairs }: { pairs: [string, React.ReactNode][] }) {
  return (
    <tr className="border-b border-hairline last:border-b-0">
      {pairs.map(([label, value], i) => (
        <React.Fragment key={i}>
          <td className="border-r border-hairline bg-surface-soft px-3.5 py-2 align-top text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle">
            {label}
          </td>
          <td className="border-r border-hairline px-3.5 py-2 align-top font-semibold text-ink-strong">
            {value}
          </td>
        </React.Fragment>
      ))}
    </tr>
  );
}

/** A row whose value spans the full width (notes / descriptions). */
function FullRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-hairline last:border-b-0">
      <td className="border-r border-hairline bg-surface-soft px-3.5 py-2 align-top text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle">
        {label}
      </td>
      <td colSpan={3} className="px-3.5 py-2 align-top font-medium text-ink-strong">
        {children}
      </td>
    </tr>
  );
}
