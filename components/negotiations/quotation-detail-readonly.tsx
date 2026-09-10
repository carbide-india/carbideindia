import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Lock } from "lucide-react";
import { formatDate, formatInr } from "@/lib/format";
import {
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
} from "@/db/enums";
import type { QuotationFullDetail } from "@/lib/queries/quotations";

/** numeric string → ₹, em-dash when unset/unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

function txt(value: string | null): string {
  return value && value.trim() ? value : "—";
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{children}</span>
    </div>
  );
}

const TH =
  "whitespace-nowrap px-2.5 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-ink-subtle";
const TD = "whitespace-nowrap px-2.5 py-2 align-top text-[12.5px] text-ink-soft";

/**
 * The COMPLETE quotation this negotiation is based on, rendered strictly
 * read-only for reference — full header (identity, send status, who/when) and
 * every product line with its resolved spec + commercials, plus roll-up totals.
 * Nothing here is editable; the source of truth is the Quotation stage.
 */
export function QuotationDetailReadonly({
  detail,
}: {
  detail: QuotationFullDetail;
}) {
  const h = detail.header;
  const tone = QUOTATION_STATUS_COLORS[h.quotationStatus] ?? "slate";
  const currency = h.currency ?? "INR";

  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">
          Quotation Details
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-soft px-2.5 py-1 text-[11.5px] font-bold text-ink-subtle">
            <Lock size={11} strokeWidth={2.6} />
            Read-only · from {h.quoteNo}
          </span>
          <Link
            href={`/quotations/${h.id}/quotation.pdf` as Route}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-brand hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open PDF
            <ArrowUpRight size={13} strokeWidth={2.4} />
          </Link>
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-subtle">
        The complete quotation this negotiation is based on — full header and
        every line, for reference only.
      </p>

      {/* Header KV grid */}
      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <KV label="Quote No">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} className="text-brand">
            {h.quoteNo}
          </span>
        </KV>
        <KV label="Revision">
          {h.isRevision ? `Revision R${h.revisionNo - 1}` : "Original"}
        </KV>
        <KV label="Company">{txt(h.companyName)}</KV>
        <KV label="Enquiry Date">{h.enquiryDate ? formatDate(h.enquiryDate) : "—"}</KV>
        <KV label="Quotation Status">
          <span
            className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold"
            style={{
              background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
              color: `var(--color-${tone}-deep)`,
              border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
            }}
          >
            {QUOTATION_STATUS_LABELS[h.quotationStatus]}
          </span>
        </KV>
        <KV label="Quote Sent">
          {h.quoteSent
            ? `Yes${h.quoteSentAt ? ` · ${formatDate(h.quoteSentAt)}` : ""}`
            : "Not sent"}
        </KV>
        <KV label="Sent To">
          {h.quoteSentTo && h.quoteSentTo.to.length > 0
            ? h.quoteSentTo.to.join(", ")
            : "—"}
        </KV>
        <KV label="Created By">{txt(h.createdByName)}</KV>
        <KV label="Currency">{currency}</KV>
        <KV label="Document">
          <Link
            href={`/quotations/${h.id}/quotation.pdf` as Route}
            className="inline-flex items-center gap-1 text-brand hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open PDF
            <ArrowUpRight size={12} strokeWidth={2.4} />
          </Link>
        </KV>
      </div>

      {/* Lines table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: 1060 }}>
          <thead>
            <tr className="bg-surface-soft">
              <th className={TH}>#</th>
              <th className={TH}>Product Name</th>
              <th className={TH}>IPC</th>
              <th className={`${TH} text-right`}>Qty</th>
              <th className={TH}>Drawing No</th>
              <th className={TH}>Rev</th>
              <th className={TH}>Part No</th>
              <th className={TH}>Grade Name</th>
              <th className={TH}>Cust. Grade</th>
              <th className={TH}>Tolerance</th>
              <th className={TH}>Condition</th>
              <th className={`${TH} text-right`}>Final Cost</th>
              <th className={`${TH} text-right`}>Negotiation</th>
              <th className={`${TH} text-right`}>Quote Price</th>
              <th className={TH}>Dev. Time</th>
              <th className={TH}>Delivery</th>
              <th className={TH}>Validity</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l, i) => (
              <tr key={i} className="border-t border-hairline">
                <td className={TD}>{i + 1}</td>
                <td className={`${TD} font-semibold text-ink-strong`}>{txt(l.productName)}</td>
                <td className={TD}>
                  {l.itemCode ? (
                    <span
                      className="font-mono text-[11.5px] font-semibold text-brand"
                      title={l.itemCode}
                    >
                      {l.itemCode}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{txt(l.qty)}</td>
                <td className={TD}>{txt(l.drawingNo)}</td>
                <td className={TD}>{txt(l.drawingRev)}</td>
                <td className={TD}>{txt(l.partNo)}</td>
                <td className={TD}>{txt(l.gradeName)}</td>
                <td className={TD}>{txt(l.gradeCustomer)}</td>
                <td className={TD}>{txt(l.tolerance)}</td>
                <td className={TD}>{txt(l.condition)}</td>
                <td className={`${TD} text-right tabular-nums`}>{money(l.finalCost)}</td>
                <td className={`${TD} text-right tabular-nums`}>{money(l.negotiation)}</td>
                <td className={`${TD} text-right tabular-nums font-bold text-ink-strong`}>
                  {money(l.quotePrice)}
                </td>
                <td className={TD}>{txt(l.developmentTime)}</td>
                <td className={TD}>{txt(l.deliveryTime)}</td>
                <td className={TD}>{txt(l.validity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-dashed border-hairline-strong pt-4">
        <KV label="Lines">
          {detail.totals.lineCount} {detail.totals.lineCount === 1 ? "product" : "products"}
        </KV>
        <KV label="Total Order Qty">
          <span className="tabular-nums">
            {detail.totals.totalQty.toLocaleString("en-IN")} Nos
          </span>
        </KV>
        <KV label="Total Quoted Value">
          <span className="tabular-nums text-[18px] font-extrabold text-brand">
            {formatInr(detail.totals.totalQuotedValue)}
          </span>
        </KV>
      </div>
    </section>
  );
}
