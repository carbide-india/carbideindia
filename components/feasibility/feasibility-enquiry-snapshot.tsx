import * as React from "react";
import { CHECK_STATE_LABELS, type CheckState } from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";

/**
 * The full auto-fetched enquiry snapshot shown (read-only) at the top of a
 * Primary-Feasibility review — every field the client sheet lists, in order,
 * so the reviewer sees the complete enquiry without leaving the screen. The
 * five checks + sign-off below it are the only editable parts (the workspace).
 */

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const dash = (v: React.ReactNode): React.ReactNode =>
  v == null || v === "" ? <span className="text-[#b3b8c2]">-</span> : v;

const dim = (v: string | number | null | undefined): React.ReactNode =>
  v ? `${v} mm` : <span className="text-[#b3b8c2]">-</span>;

const check = (v: string | null | undefined): React.ReactNode =>
  v ? CHECK_STATE_LABELS[v as CheckState] ?? v : <span className="text-[#b3b8c2]">-</span>;

/** One label/value cell. */
function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">{label}</span>
      <span className="text-[15.5px] font-bold leading-snug text-[#14151a]">{value}</span>
    </div>
  );
}

/** A titled section band - prominent indigo accent + larger heading. */
function Band({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-y-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
      <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
      <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
        {title}
      </span>
    </div>
  );
}

export function FeasibilityEnquirySnapshot({
  inquiry,
  product,
}: {
  inquiry: Inquiry;
  /** First product line (the sheet is a flat single-product row). */
  product: InquiryProductCard | null;
}) {
  const docs = (inquiry.docsGiven ?? []) as string[];
  const gridClass = "grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-4";

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
      <Band title="Enquiry & Customer" />
      <div className={gridClass}>
        <Cell label="Enquiry Date" value={fmtDate(inquiry.enquiryDate)} />
        <Cell label="SM Number" value={dash(inquiry.smNumber)} />
        <Cell label="Company Name" value={dash(inquiry.companyName)} />
        <Cell label="Customer First Name" value={dash(inquiry.contactFirstName)} />
        <Cell label="Customer Last Name" value={dash(inquiry.contactLastName)} />
        <Cell label="Contact No" value={dash(inquiry.contactNo)} />
        <Cell label="Country Name" value={dash(inquiry.country)} />
      </div>

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

      <Band title="Enquiry Checks (from the enquiry form)" />
      <div className={gridClass}>
        <Cell label="Shape & Dimension Check" value={check(inquiry.shapeDimensionCheck)} />
        <Cell label="Grade (Customer) Check" value={check(inquiry.gradeCheck)} />
        <Cell label="Tolerance Check" value={check(inquiry.toleranceCheck)} />
        <Cell label="Condition Check" value={check(inquiry.conditionCheck)} />
      </div>

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

      <Band title="Links & Notes" />
      <div className={gridClass}>
        <div className="col-span-full sm:col-span-2 lg:col-span-2">
          <Cell
            label="SM Folder Link"
            value={
              inquiry.smFolderLink ? (
                <a
                  href={inquiry.smFolderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-semibold text-[#3f3f94] hover:underline"
                >
                  {inquiry.smFolderLink}
                </a>
              ) : (
                dash(null)
              )
            }
          />
        </div>
        <div className="col-span-full sm:col-span-3 lg:col-span-2">
          <Cell label="Enquiry Notes" value={dash(inquiry.enquiryNotes)} />
        </div>
      </div>
    </div>
  );
}
