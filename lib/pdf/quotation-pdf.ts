import PDFDocument from "pdfkit";
import type {
  QuotationPdfModel,
  QuotationPdfLine,
} from "@/lib/queries/quotations";

/**
 * Renders the customer-facing quotation to match Carbide India's official
 * quotation form (legal entity Yogeshwar Engg. Pvt Ltd) exactly: a fully
 * bordered document — company masthead, a To / Quotation-No header, a multi-line
 * item table (Sr · Description · Grade · MOQ · Condition · Rate Per Unit ·
 * Amount) with a precise total, the standard commercial-terms block, and the
 * "signature not required" footer.
 *
 * This module is PURE — it takes a fully-resolved `QuotationPdfModel` and a logo
 * buffer and returns bytes. It imports no auth, no DB, no `server-only`, so it
 * can be unit-rendered in isolation. The route builds the model + logo; this
 * only draws.
 *
 * Every value is DYNAMIC — filled only from the model (company, city, contact,
 * SM number, source, dates, line specs, prices, and the commercial terms the
 * quotation actually carries: delivery time, tolerance, validity). Nothing is
 * ever defaulted to boilerplate. The official form's rows that the WMS does not
 * model (GEM No, GST, Payment Term, Packing & Forwarding, Note) keep their row
 * label but stay BLANK rather than showing invented values.
 */

// The official form's palette: indigo brand text, a red QUOTATION title, a
// yellow-highlighted payment term, and thin black rules for the grid.
const C = {
  brand: "#3F3F94",
  title: "#C00000",
  ink: "#111111",
  inkSoft: "#333333",
  border: "#000000",
  headFill: "#F2F2F2",
  yellow: "#FFFF00",
} as const;

const grp0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const grp2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** DD-MM-YYYY, the format the official form uses. */
function ddmmyyyy(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
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

/** Render the quotation PDF from its print model. Exported so the send action
 *  attaches the SAME bytes the preview showed — not a second, subtly different
 *  document. */
export async function renderQuotationPdf(
  model: QuotationPdfModel,
  opts: { logo: Buffer | null },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: {
      Title: `Quotation - ${model.quoteNo}`,
      Author: "Yogeshwar Engineering Pvt Ltd",
      Subject: "Quotation",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ── cell helpers ──────────────────────────────────────────────
  const box = (x: number, y: number, w: number, h: number, fill?: string) => {
    if (fill) doc.save().rect(x, y, w, h).fill(fill).restore();
    doc.save().rect(x, y, w, h).lineWidth(0.7).strokeColor(C.border).stroke().restore();
  };
  const put = (
    str: string,
    x: number,
    y: number,
    w: number,
    o: {
      font?: string;
      size?: number;
      color?: string;
      align?: "left" | "center" | "right";
    } = {},
  ) => {
    doc
      .font(o.font ?? "Helvetica")
      .fontSize(o.size ?? 8)
      .fillColor(o.color ?? C.ink)
      .text(str, x, y, { width: w, align: o.align ?? "left", lineBreak: false });
  };
  /** Single line, vertically centred within a cell of height h. */
  const cell = (
    str: string,
    x: number,
    y: number,
    w: number,
    h: number,
    o: Parameters<typeof put>[4] & { padX?: number } = {},
  ) => {
    const size = o.size ?? 8;
    const padX = o.padX ?? 4;
    put(str, x + padX, y + (h - size) / 2 - 1, w - padX * 2, o);
  };

  let y = doc.page.margins.top;

  // ── 1 · Masthead ──────────────────────────────────────────────
  const H_MAST = 92;
  const logoW = 150;
  box(left, y, width, H_MAST);
  doc.save().moveTo(left + logoW, y).lineTo(left + logoW, y + H_MAST).lineWidth(0.7).strokeColor(C.border).stroke().restore();
  if (opts.logo) {
    try {
      doc.image(opts.logo, left + 24, y + 22, { fit: [logoW - 44, 48] });
    } catch {
      /* wordmark-free — the company block still identifies the sender */
    }
  }
  const dx = left + logoW + 12;
  const dw = right - dx - 8;
  put("Yogeshwar Engg. Pvt Ltd", dx, y + 8, dw, { font: "Helvetica-Bold", size: 12, color: C.brand });
  put("W-150/A, MIDC Ambad, Nashik", dx, y + 24, dw, { font: "Helvetica-Bold", size: 7.5, color: C.brand });
  put("Tel :-+91-253-2384232, 2382830", dx, y + 42, dw, { font: "Helvetica-Bold", size: 7.5, color: C.brand });
  put("Fax -+91-253-2381445", dx, y + 53, dw, { font: "Helvetica-Bold", size: 7.5, color: C.brand });
  put("E-mail : sales1@carbideindia.com", dx, y + 64, dw, { font: "Helvetica-Bold", size: 7.5, color: C.brand });
  put("URL : www.carbideindia.com", dx, y + 75, dw, { font: "Helvetica-Bold", size: 7.5, color: C.brand });
  y += H_MAST;

  // ── 2 · QUOTATION title ───────────────────────────────────────
  const H_TITLE = 20;
  box(left, y, width, H_TITLE);
  cell("QUOTATION", left, y, width, H_TITLE, {
    font: "Helvetica-Bold",
    size: 13,
    color: C.title,
    align: "center",
  });
  y += H_TITLE;

  // ── 3 · To / Quotation-No header ──────────────────────────────
  const H_HEAD = 88;
  const midX = left + 300;
  const labelW = 96;
  const labelEnd = midX + labelW;
  box(left, y, midX - left, H_HEAD); // To cell
  box(midX, y, right - midX, H_HEAD); // right block
  doc.save().moveTo(labelEnd, y).lineTo(labelEnd, y + H_HEAD).lineWidth(0.7).strokeColor(C.border).stroke().restore();

  put("To,", left + 6, y + 8, 40, { font: "Helvetica-Bold", size: 8, color: C.title });
  put(model.companyName ?? "", left + 26, y + 8, midX - left - 32, {
    font: "Helvetica-Bold",
    size: 9.5,
    color: C.ink,
  });
  if (model.city)
    put(model.city, left + 26, y + 24, midX - left - 32, { font: "Helvetica-Bold", size: 8.5, color: C.ink });

  const headRows: [string, string, boolean][] = [
    ["Quotation No.", model.quoteNo, false],
    ["Quotation Date", ddmmyyyy(model.quotationDate), false],
    ["Enquiry Ref  .", model.enquiryRef ?? "", false],
    ["Enquiry Date", ddmmyyyy(model.enquiryDate), false],
    ["ENQ.No", model.smNumber ?? "", false],
    ["GEM No.:", "", true],
  ];
  const rH = (H_HEAD - 8) / headRows.length;
  headRows.forEach(([label, value, isGem], i) => {
    const ry = y + 4 + i * rH;
    put(label, midX + 4, ry + (rH - 8) / 2 - 1, labelW - 8, {
      font: "Helvetica-Bold",
      size: 8,
      color: C.ink,
      align: "right",
    });
    // The GEM row's label already carries its colon; the rest get ": value".
    put(isGem ? value : `: ${value}`, labelEnd + 4, ry + (rH - 8) / 2 - 1, right - labelEnd - 8, {
      font: "Helvetica-Bold",
      size: 8,
      color: C.ink,
    });
  });
  y += H_HEAD;

  // ── 4 · Kind Attn + intro ─────────────────────────────────────
  const H_ATTN = 44;
  box(left, y, width, H_ATTN);
  put("Kind Attn.:", left + 6, y + 8, 60, { font: "Helvetica-Bold", size: 8, color: C.title });
  if (model.contactName)
    put(model.contactName, left + 58, y + 8, width - 64, { font: "Helvetica-Bold", size: 8, color: C.ink });
  put(
    "We have pleasure in offering our lowest quotation for following items.",
    left + 6,
    y + 28,
    width - 12,
    { size: 8.5, color: C.ink },
  );
  y += H_ATTN;

  // ── 5 · Item table ────────────────────────────────────────────
  // Columns (widths sum to `width`).
  const cols = [
    { key: "sr", w: 26, label: "Sr.", unit: "", align: "center" as const },
    { key: "desc", w: 210, label: "Description", unit: "", align: "left" as const },
    { key: "grade", w: 52, label: "Grade", unit: "", align: "center" as const },
    { key: "moq", w: 42, label: "MOQ", unit: "Nos.", align: "center" as const },
    { key: "cond", w: 58, label: "Condition", unit: "", align: "center" as const },
    { key: "rate", w: 60, label: "Rate Per Unit", unit: "Rs.", align: "center" as const },
    { key: "amt", w: width - 448, label: "Amount", unit: "Rs.", align: "center" as const },
  ];
  const colX: number[] = [];
  {
    let cx = left;
    for (const c of cols) {
      colX.push(cx);
      cx += c.w;
    }
  }
  const xOf = (i: number) => colX[i]!;
  const wOf = (i: number) => cols[i]!.w;

  // Header row 1 — titles.
  const H_HDR1 = 22;
  cols.forEach((c, i) => {
    box(xOf(i), y, c.w, H_HDR1, C.headFill);
    cell(c.label, xOf(i), y, c.w, H_HDR1, {
      font: "Helvetica-Bold",
      size: 8,
      align: "center",
    });
  });
  y += H_HDR1;
  // Header row 2 — units (Nos. / Rs. / Rs.), on the same light fill.
  const H_HDR2 = 12;
  cols.forEach((c, i) => {
    box(xOf(i), y, c.w, H_HDR2, C.headFill);
    if (c.unit)
      cell(c.unit, xOf(i), y, c.w, H_HDR2, {
        font: "Helvetica-Bold",
        size: 7.5,
        align: "center",
      });
  });
  y += H_HDR2;

  // Body rows — the actual lines, padded with blank rows to a minimum of 6 so
  // the table keeps the form's shape even for a one-line quote.
  const H_ROW = 26;
  const minRows = 6;
  const rowCount = Math.max(model.lines.length, minRows);
  for (let i = 0; i < rowCount; i++) {
    const l: QuotationPdfLine | undefined = model.lines[i];
    cols.forEach((_, ci) => box(xOf(ci), y, wOf(ci), H_ROW));
    if (l) {
      cell(String(l.sr), xOf(0), y, wOf(0), H_ROW, { align: "center" });
      // Description: product name + "As per drg no. …" beneath.
      put(l.productName ?? "", xOf(1) + 4, y + 4, wOf(1) - 8, {
        font: "Helvetica-Bold",
        size: 8,
        color: C.ink,
      });
      if (l.drawingNo)
        put(`As per drg no.  ${l.drawingNo}`, xOf(1) + 4, y + 15, wOf(1) - 8, {
          size: 7.5,
          color: C.inkSoft,
        });
      cell(l.grade ?? "", xOf(2), y, wOf(2), H_ROW, { font: "Helvetica-Bold", align: "center" });
      cell(qtyStr(l.qty), xOf(3), y, wOf(3), H_ROW, { font: "Helvetica-Bold", align: "center" });
      cell(l.condition ?? "", xOf(4), y, wOf(4), H_ROW, { align: "center" });
      cell(rateStr(l.ratePerUnit), xOf(5), y, wOf(5), H_ROW, { font: "Helvetica-Bold", align: "center" });
      cell(amountStr(l.amount), xOf(6), y, wOf(6), H_ROW, { font: "Helvetica-Bold", align: "right", padX: 6 });
    }
    y += H_ROW;
  }

  // Total row — one blank cell Sr…Condition, then Total, then the sum.
  const H_TOT = 20;
  box(xOf(0), y, xOf(5) - xOf(0), H_TOT);
  box(xOf(5), y, wOf(5), H_TOT);
  box(xOf(6), y, wOf(6), H_TOT);
  cell("Total", xOf(5), y, wOf(5), H_TOT, { font: "Helvetica-Bold", size: 8.5, align: "center" });
  cell(grp2.format(model.total), xOf(6), y, wOf(6), H_TOT, {
    font: "Helvetica-Bold",
    size: 8.5,
    align: "right",
    padX: 6,
  });
  y += H_TOT;

  // ── 6 · Commercial terms ──────────────────────────────────────
  // Every value is DYNAMIC, resolved from its real source (Manan, 2026-09):
  // Payment Term + Delivery Lead Time from the line's chosen costing vendor, GST
  // from the client KYC, Validity from the quotation, Tolerance read-through, and
  // Note from the costing's Commercial Notes. Blank when the source is empty —
  // never invented wording. Packing & Forwarding has no source, so it stays blank.
  const termLabelW = 155;
  const termValX = left + termLabelW;
  const termValW = right - termValX;
  const val = (s: string | null): string => (s && s.trim() ? s.trim() : "");
  const paymentTerm = val(model.paymentTerm);

  const terms: { label: string; value: string; h: number; fill?: string; valueBold?: boolean }[] = [
    { label: "Payment Term", value: paymentTerm, h: 18, fill: paymentTerm ? C.yellow : undefined, valueBold: true },
    { label: "GST", value: val(model.gst), h: 18 },
    { label: "Delivery Lead Time", value: val(model.deliveryLeadTime), h: 18 },
    { label: "Tolerance", value: val(model.tolerance), h: 18 },
    { label: "Packing & Forwarding Charges", value: "", h: 18 },
    { label: "Validity of Quotation", value: val(model.validity), h: 30 },
    { label: "Note", value: val(model.note), h: 30 },
  ];
  for (const t of terms) {
    box(left, y, termLabelW, t.h);
    box(termValX, y, termValW, t.h, t.fill);
    put(t.label, left + 5, y + (t.h <= 18 ? (t.h - 8) / 2 - 1 : 5), termLabelW - 10, {
      font: "Helvetica-Bold",
      size: 8,
      color: C.ink,
    });
    // Value: single-line terms centre vertically; the two paragraph rows wrap.
    if (t.h <= 18) {
      put(t.value, termValX + 6, y + (t.h - 8) / 2 - 1, termValW - 12, {
        font: t.valueBold ? "Helvetica-Bold" : "Helvetica",
        size: 8,
        color: C.ink,
      });
    } else {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(C.ink)
        .text(t.value, termValX + 6, y + 5, { width: termValW - 12, align: "left" });
    }
    y += t.h;
  }

  // ── 7 · Signature ─────────────────────────────────────────────
  const H_SIG = 86;
  box(left, y, width, H_SIG);
  put("Yogeshwar Engg. Pvt Ltd", left, y + 16, width, {
    font: "Helvetica-Bold",
    size: 12,
    color: C.ink,
    align: "center",
  });
  put("Sales Official", left, y + 54, width, {
    font: "Helvetica-Bold",
    size: 9,
    color: C.ink,
    align: "center",
  });
  put("Signature not required as it is computer generated document.", left, y + 72, width, {
    size: 8,
    color: C.inkSoft,
    align: "center",
  });
  y += H_SIG;

  doc.end();
  return done;
}
