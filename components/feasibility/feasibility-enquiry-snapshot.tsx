import * as React from "react";
import type { Inquiry } from "@/db/schema";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";
import {
  Band,
  Cell,
  EnquiryChecksBand,
  EnquiryCustomerBand,
  LinksNotesBand,
  check,
  dash,
  dim,
} from "@/components/feasibility/snapshot-primitives";

/**
 * The full auto-fetched enquiry snapshot shown (read-only) at the top of a
 * Primary-Feasibility review — every field the client sheet lists, in order,
 * so the reviewer sees the complete enquiry without leaving the screen. The
 * five checks + sign-off below it are the only editable parts (the workspace).
 * The Secondary review renders `SecondaryProductDetailsPanel` instead — same
 * bands, but Product & Quantity and Dimensions & Specification are editable.
 */
export function FeasibilityEnquirySnapshot({
  inquiry,
  product,
}: {
  inquiry: Inquiry;
  /** First product line (the sheet is a flat single-product row). */
  product: InquiryProductCard | null;
}) {
  const docs = (inquiry.docsGiven ?? []) as string[];

  // Dimensions: a measurement box is only shown when it has a value — so
  // dims that don't apply to the shape (e.g. Width/Thickness on a Cylinder)
  // drop off the screen instead of showing a bare "-". Shape + the spec fields
  // (grade/tolerance/condition) always show. All visible boxes sit on one line.
  const has = (v: string | number | null | undefined): boolean =>
    v != null && String(v).trim() !== "";
  const outerDia = product?.outerDia ?? inquiry.outerDia;
  const innerDia = product?.innerDia ?? inquiry.innerDia;
  const length = product?.length ?? inquiry.length;
  const width = product?.width ?? inquiry.width;
  const thickness = product?.thickness ?? inquiry.thickness;
  const dimCells: { label: string; value: React.ReactNode }[] = [
    { label: "Shape", value: dash(product?.shapeName ?? inquiry.shape) },
    ...(has(outerDia) ? [{ label: "Outer Dia", value: dim(outerDia) }] : []),
    ...(has(innerDia) ? [{ label: "Inner Dia", value: dim(innerDia) }] : []),
    ...(has(length) ? [{ label: "Length", value: dim(length) }] : []),
    ...(has(width) ? [{ label: "Width", value: dim(width) }] : []),
    ...(has(thickness) ? [{ label: "Thickness", value: dim(thickness) }] : []),
    { label: "Grade (Customer)", value: dash(product?.gradeCustomer ?? product?.gradeName) },
    { label: "Tolerance", value: dash(product?.toleranceName) },
    { label: "Condition", value: dash(product?.conditionName) },
  ];

  return (
    <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
      <EnquiryCustomerBand inquiry={inquiry} />

      <Band title="Product & Quantity" />
      <div className="grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-6">
        {/* Product description gets the extra width (spans 2) and wraps long
            text; the four quantity fields share the rest of the same line. */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <Cell label="Product Description (Detailed Note)" value={dash(inquiry.productDescription)} />
        </div>
        <Cell label="Quantity Status" value={check(inquiry.quantityStatus)} />
        <Cell label="Quantity (Nos)" value={dash(inquiry.quantityNos)} />
        <Cell label="Quantity (UOM)" value={dash(inquiry.quantityUom)} />
        <Cell label="Sample Received" value={inquiry.sampleReceived == null ? dash(null) : inquiry.sampleReceived ? "Yes" : "No"} />
        <div className="col-span-full">
          <Cell label="Docs Given" value={docs.length ? docs.join(", ") : dash(null)} />
        </div>
      </div>

      <EnquiryChecksBand inquiry={inquiry} />

      <Band title="Dimensions & Specification" />
      {/* All applicable boxes on ONE line (equal widths on desktop); boxes that
          don't apply to the shape are omitted entirely. Stacks on small screens. */}
      <div className="flex flex-col divide-y divide-[#c6cbdd] lg:flex-row lg:divide-x lg:divide-y-0">
        {dimCells.map((c) => (
          <div key={c.label} className="lg:min-w-0 lg:flex-1">
            <Cell label={c.label} value={c.value} />
          </div>
        ))}
      </div>
      <div className="border-t border-[#c6cbdd]">
        <Cell label="Dimension Notes" value={dash(inquiry.dimensionNotes)} />
      </div>

      <LinksNotesBand inquiry={inquiry} />
    </div>
  );
}
