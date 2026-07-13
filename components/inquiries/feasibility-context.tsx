"use client";

import * as React from "react";
import { MiniField } from "./form-field";
import { Chip } from "./chip";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";
import type { Inquiry } from "@/db/schema";
import { CHECK_STATE_LABELS, type CheckState } from "@/db/enums";

const dash = (v: string | null | undefined) =>
  v == null || v === "" ? <span className="text-ink-subtle">—</span> : v;

const ASSUMED_LABELS: Record<string, string> = {
  quantity: "Quantity",
  shapeDimension: "Shape & Dimension",
  grade: "Grade",
  tolerance: "Tolerance",
  condition: "Condition",
};

/** Everything the enquiry captured for one product, read-only + complete. */
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

  const dim = (v: string | number | null | undefined) =>
    v ? `${v} mm` : dash(null);

  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface-card">
      {/* Identity */}
      <SpecGroup title="Identity">
        <div className="grid grid-cols-4 gap-x-5 gap-y-3.5 max-lg:grid-cols-2 max-md:grid-cols-1">
          <MiniField label="Customer Product Name">{dash(product.custProductName)}</MiniField>
          <MiniField label="Item Code">{dash(product.itemCode)}</MiniField>
          <MiniField label="Drawing No">{dash(product.custDrawingNo)}</MiniField>
          <MiniField label="Drawing Rev">{dash(product.drawingRevisionNo)}</MiniField>
        </div>
      </SpecGroup>

      {/* Shape & Dimensions */}
      <SpecGroup title="Shape & Dimensions">
        <div className="grid grid-cols-6 gap-x-5 gap-y-3.5 max-lg:grid-cols-3 max-md:grid-cols-2">
          <MiniField label="Shape">{dash(product.shapeName)}</MiniField>
          <MiniField label="Outer Dia">{dim(product.outerDia)}</MiniField>
          <MiniField label="Inner Dia">{dim(product.innerDia)}</MiniField>
          <MiniField label="Length">{dim(product.length)}</MiniField>
          <MiniField label="Width">{dim(product.width)}</MiniField>
          <MiniField label="Thickness">{dim(product.thickness)}</MiniField>
        </div>
        {product.dimensionNotes && (
          <MiniField label="Dimension Notes" className="mt-3.5">{product.dimensionNotes}</MiniField>
        )}
      </SpecGroup>

      {/* Grade · Tolerance · Condition · Quantity */}
      <SpecGroup title="Grade · Tolerance · Condition · Quantity">
        <div className="grid grid-cols-6 gap-x-5 gap-y-3.5 max-lg:grid-cols-3 max-md:grid-cols-2">
          <MiniField label="Internal Grade">{dash(product.gradeName)}</MiniField>
          <MiniField label="Customer Grade">{dash(product.gradeCustomer)}</MiniField>
          <MiniField label="Tolerance">{dash(product.toleranceName)}</MiniField>
          <MiniField label="Condition">{dash(product.conditionName)}</MiniField>
          <MiniField label="Quantity">
            {product.quantityNos ? `${product.quantityNos} ${product.quantityUom}` : dash(null)}
          </MiniField>
          <MiniField label="Quantity Status">
            {inquiry.quantityStatus
              ? CHECK_STATE_LABELS[inquiry.quantityStatus as CheckState]
              : dash(null)}
          </MiniField>
        </div>
      </SpecGroup>

      {/* Context — sample / docs / assumed + free-text */}
      <SpecGroup title="Context">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Sample:</span>
            <Chip label={inquiry.sampleReceived ? "Received" : "Not received"} tone={inquiry.sampleReceived ? "green" : "slate"} />
            <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Docs:</span>
            {docs.length ? docs.map((d) => <Chip key={d} label={d} tone="blue" />) : <span className="text-[13px] text-ink-subtle">—</span>}
          </div>

          {assumedChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Assumed:</span>
              {assumedChips.map((c) => <Chip key={c} label={c} tone="amber" />)}
            </div>
          )}

          {(inquiry.productDescription || inquiry.enquiryNotes) && (
            <div className="mt-1 grid grid-cols-2 gap-5 max-md:grid-cols-1">
              <MiniField label="Product Description">{dash(inquiry.productDescription)}</MiniField>
              <MiniField label="Enquiry Notes">{dash(inquiry.enquiryNotes)}</MiniField>
            </div>
          )}
        </div>
      </SpecGroup>
    </div>
  );
}

/** A titled, padded block within the product context card. */
function SpecGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#3f3f94]">
        {title}
      </div>
      {children}
    </div>
  );
}
