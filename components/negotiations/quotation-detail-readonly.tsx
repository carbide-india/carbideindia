import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Lock } from "lucide-react";
import type { QuotationPdfModel, QuotationPdfLine } from "@/lib/queries/quotations";

/**
 * The quotation this negotiation rests on, rendered READ-ONLY as an on-screen
 * replica of Carbide India's official quotation PDF (SM9540 form) — the same
 * bordered document the "Open PDF" link downloads, driven by the same
 * `QuotationPdfModel`. Always the LATEST revision (the page resolves the chain
 * head). It is a paper preview: white with black rules regardless of theme, so
 * it reads as the document it mirrors.
 */

const PAPER = "#ffffff";
const INK = "#111111";
const BRAND = "#3f3f94";
const RED = "#c00000";
const BORDER = "#111111";
const HEAD = "#f2f2f2";

const grp0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const grp2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ddmmyyyy(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${dt.getFullYear()}`;
}
function qtyStr(v: string | null): string {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n.toString() : v ? v.trim() : "";
}
function rateStr(v: string | null): string {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? String(Math.round(n)) : "";
}
function amountStr(n: number | null): string {
  return n == null ? "" : grp0.format(Math.round(n));
}

/** Border helper for the grid cells. */
const cellBorder = `1px solid ${BORDER}`;

export function QuotationDetailReadonly({ model }: { model: QuotationPdfModel }) {
  // Pad the item table to the form's shape (the PDF keeps blank rows). Cap the
  // filler so a many-line quote doesn't add pointless empty rows.
  const MIN_ROWS = 6;
  const rowCount = Math.max(model.lines.length, MIN_ROWS);
  const rows: (QuotationPdfLine | null)[] = Array.from(
    { length: rowCount },
    (_, i) => model.lines[i] ?? null,
  );

  const headRows: [string, string][] = [
    ["Quotation No.", model.quoteNo],
    ["Quotation Date", ddmmyyyy(model.quotationDate)],
    ["Enquiry Ref  .", model.enquiryRef ?? ""],
    ["Enquiry Date", ddmmyyyy(model.enquiryDate)],
    ["ENQ.No", model.smNumber ?? ""],
    ["GEM No.:", ""],
  ];

  // Same terms the PDF prints — every value resolved dynamically from its real
  // source (payment term + lead time from the costing's chosen vendor, GST from
  // the client KYC, validity from the quotation, note from the costing's
  // Commercial Notes). Blank where the source is empty; P&F has no source.
  const terms: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Payment Term", value: model.paymentTerm?.trim() || "", highlight: true },
    { label: "GST", value: model.gst?.trim() || "" },
    { label: "Delivery Lead Time", value: model.deliveryLeadTime?.trim() || "" },
    { label: "Tolerance", value: model.tolerance?.trim() || "" },
    { label: "Packing & Forwarding Charges", value: "" },
    { label: "Validity of Quotation", value: model.validity?.trim() || "" },
    { label: "Note", value: model.note?.trim() || "" },
  ];

  const th: React.CSSProperties = {
    border: cellBorder,
    background: HEAD,
    padding: "6px 6px",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    border: cellBorder,
    padding: "6px 6px",
    fontSize: 11.5,
    verticalAlign: "top",
  };

  return (
    <section className="flex flex-col gap-3">
      {/* Context strip (app-themed) */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">
          Quotation Details
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-soft px-2.5 py-1 text-[11.5px] font-bold text-ink-subtle">
            <Lock size={11} strokeWidth={2.6} />
            Read-only · from {model.quoteNo}
          </span>
          <Link
            href={`/quotations/${model.id}/quotation.pdf` as Route}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-brand hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open PDF
            <ArrowUpRight size={13} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* Paper replica of the official quotation PDF */}
      <div className="overflow-x-auto">
        <div
          style={{
            minWidth: 720,
            maxWidth: 880,
            background: PAPER,
            color: INK,
            border: cellBorder,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          }}
        >
          {/* Masthead */}
          <div style={{ display: "flex", borderBottom: cellBorder }}>
            <div
              style={{
                width: 150,
                flexShrink: 0,
                borderRight: cellBorder,
                display: "grid",
                placeItems: "center",
                padding: 10,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo.png"
                alt="Carbide India"
                style={{ maxHeight: 52, width: "auto" }}
              />
            </div>
            <div style={{ padding: "10px 12px", color: BRAND, lineHeight: 1.45 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Yogeshwar Engg. Pvt Ltd</div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>W-150/A, MIDC Ambad, Nashik</div>
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700 }}>
                Tel :-+91-253-2384232, 2382830
                <br />
                Fax -+91-253-2381445
                <br />
                E-mail : sales1@carbideindia.com
                <br />
                URL : www.carbideindia.com
              </div>
            </div>
          </div>

          {/* QUOTATION title */}
          <div
            style={{
              borderBottom: cellBorder,
              padding: "5px 0",
              textAlign: "center",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: RED,
            }}
          >
            QUOTATION
          </div>

          {/* To / Quotation-No block */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: cellBorder }}>
            <div style={{ borderRight: cellBorder, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: RED }}>To,</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800 }}>
                {model.companyName ?? "—"}
              </div>
              {model.city && (
                <div style={{ fontSize: 12, fontWeight: 700 }}>{model.city}</div>
              )}
            </div>
            <div style={{ padding: "8px 12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontWeight: 700 }}>
                <tbody>
                  {headRows.map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ textAlign: "right", paddingRight: 8, whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {label}
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        {label === "GEM No.:" ? value : `: ${value}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kind Attn + intro */}
          <div style={{ borderBottom: cellBorder, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: RED }}>
              Kind Attn.:{" "}
              {model.contactName && (
                <span style={{ color: INK }}>{model.contactName}</span>
              )}
            </div>
            <div style={{ marginTop: 12, fontSize: 12 }}>
              We have pleasure in offering our lowest quotation for following items.
            </div>
          </div>

          {/* Item table */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Sr.</th>
                <th style={{ ...th, textAlign: "left" }}>Description</th>
                <th style={th}>Grade</th>
                <th style={th}>MOQ</th>
                <th style={th}>Condition</th>
                <th style={th}>Rate Per Unit</th>
                <th style={th}>Amount</th>
              </tr>
              <tr>
                <th style={{ ...th, fontSize: 9 }} />
                <th style={{ ...th, fontSize: 9 }} />
                <th style={{ ...th, fontSize: 9 }} />
                <th style={{ ...th, fontSize: 9 }}>Nos.</th>
                <th style={{ ...th, fontSize: 9 }} />
                <th style={{ ...th, fontSize: 9 }}>Rs.</th>
                <th style={{ ...th, fontSize: 9 }}>Rs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => (
                <tr key={i} style={{ height: 34 }}>
                  <td style={{ ...td, textAlign: "center" }}>{l ? l.sr : ""}</td>
                  <td style={td}>
                    {l && (
                      <>
                        <div style={{ fontWeight: 700 }}>{l.productName ?? ""}</div>
                        {l.drawingNo && (
                          <div style={{ fontSize: 10.5, color: "#333" }}>
                            As per drg no.&nbsp;&nbsp;{l.drawingNo}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{l ? l.grade ?? "" : ""}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{l ? qtyStr(l.qty) : ""}</td>
                  <td style={{ ...td, textAlign: "center" }}>{l ? l.condition ?? "" : ""}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{l ? rateStr(l.ratePerUnit) : ""}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {l ? amountStr(l.amount) : ""}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr>
                <td style={{ ...td, borderRight: "none" }} colSpan={4} />
                <td style={{ ...td, borderRight: "none" }} />
                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>Total</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {grp2.format(model.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Commercial terms */}
          <div>
            {terms.map((t) => (
              <div key={t.label} style={{ display: "flex", borderTop: cellBorder }}>
                <div
                  style={{
                    width: 190,
                    flexShrink: 0,
                    borderRight: cellBorder,
                    padding: "7px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {t.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 11,
                    // The Payment Term is highlighted yellow on the official form.
                    background: t.highlight && t.value ? "#FFFF00" : undefined,
                    fontWeight: t.highlight && t.value ? 700 : 400,
                  }}
                >
                  {t.value}
                </div>
              </div>
            ))}
          </div>

          {/* Signature */}
          <div style={{ borderTop: cellBorder, padding: "18px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Yogeshwar Engg. Pvt Ltd</div>
            <div style={{ marginTop: 34, fontSize: 12, fontWeight: 800 }}>Sales Official</div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#333" }}>
              Signature not required as it is computer generated document.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
