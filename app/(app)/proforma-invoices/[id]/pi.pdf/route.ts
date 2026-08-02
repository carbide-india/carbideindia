import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth/current";
import { getProformaInvoiceById } from "@/lib/queries/proforma-invoices";

/**
 * GET /proforma-invoices/[id]/pi.pdf
 *
 * A brand-consistent Proforma Invoice PDF: an indigo masthead with the Carbide
 * India wordmark, the PI identity block (PI No / SM number / date / customer),
 * the priced line table (product, qty, revised unit price, line total), the
 * revised grand total, the commercial terms (validity / delivery / development)
 * and any notes. Generated on demand — no stored pdfLink. Structure mirrors the
 * Client KYC PDF route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const C = {
  brand: "#3F3F94",
  brandDeep: "#2F2F6F",
  brandSoft: "#EEEEFB",
  ink: "#14151A",
  inkMuted: "#4B5563",
  inkSoft: "#8A90A0",
  hairline: "#E5E7EB",
  soft: "#F4F5FA",
} as const;

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(v: string | null): string {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? `Rs. ${inr.format(n)}` : "—";
}

function qtyStr(v: string | null): string {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? String(n) : (v ?? "—");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });

  const detail = await getProformaInvoiceById(id);
  if (!detail) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  let logo: Buffer | null = null;
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) logo = Buffer.from(await r.arrayBuffer());
  } catch {
    /* logo optional — the wordmark still prints */
  }

  const buffer = await render(detail, { logo });
  const stem = (detail.pi.piNo ?? "proforma-invoice").replace(/[^\w.-]+/g, "_");
  const inline = new URL(request.url).searchParams.get("view") === "1";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${stem}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type Doc = PDFKit.PDFDocument;
type Detail = NonNullable<Awaited<ReturnType<typeof getProformaInvoiceById>>>;

async function render(
  detail: Detail,
  opts: { logo: Buffer | null },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: {
      Title: `Proforma Invoice - ${detail.pi.piNo ?? ""}`,
      Author: "Carbide India WMS",
      Subject: "Proforma Invoice",
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
  const bottom = doc.page.height - doc.page.margins.bottom;

  drawMasthead(doc, opts.logo, left, right);
  drawIdentity(doc, detail, left, right, width);

  const ensure = (needed: number) => {
    if (doc.y + needed > bottom - 26) {
      doc.addPage({ size: "A4", margin: 46 });
      drawTopStripe(doc);
      doc.y = doc.page.margins.top + 6;
      drawContinuation(doc, detail, left, right);
    }
  };

  drawLineTable(doc, detail, left, width, right, ensure);
  drawTotals(doc, detail, left, width, right, ensure);
  drawTerms(doc, detail, left, width, ensure);
  drawNotes(doc, detail, left, width, ensure);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, left, right, i + 1, range.count);
  }

  doc.end();
  return done;
}

function drawTopStripe(doc: Doc): void {
  doc.save().rect(0, 0, doc.page.width, 5).fill(C.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.5).fill(C.brandDeep).restore();
}

function drawMasthead(
  doc: Doc,
  logo: Buffer | null,
  left: number,
  right: number,
): void {
  drawTopStripe(doc);
  const top = doc.page.margins.top + 4;
  let cursorX = left;
  if (logo) {
    try {
      doc.image(logo, left, top - 2, { height: 34 });
      cursorX = left + 44;
    } catch {
      /* wordmark only */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(C.brand)
    .text("CARBIDE INDIA", cursorX, top + 2, { characterSpacing: 1.6, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(C.inkSoft)
    .text("Your Tungsten Carbide & Tungsten Copper Partners", cursorX, top + 24, {
      characterSpacing: 0.4,
      lineBreak: false,
    });

  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(C.ink)
    .text("PROFORMA INVOICE", left, top, {
      width: right - left,
      align: "right",
      characterSpacing: 1.4,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(C.inkSoft)
    .text(`Generated ${generated}`, left, top + 16, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });

  doc.y = top + 44;
  doc
    .save()
    .strokeColor(C.hairline)
    .lineWidth(1)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 14;
}

function drawIdentity(
  doc: Doc,
  detail: Detail,
  left: number,
  right: number,
  width: number,
): void {
  const company = detail.companyName ?? "—";
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(C.ink).text(company, left, y, {
    width: width - 150,
  });
  const nameH = doc.heightOfString(company, { width: width - 150 });

  // Right meta: PI No pill.
  const piNo = detail.pi.piNo ?? "PI";
  doc.font("Helvetica-Bold").fontSize(9);
  const pillW = doc.widthOfString(piNo, { characterSpacing: 0.8 }) + 20;
  doc.save().roundedRect(right - pillW, y + 2, pillW, 20, 10).fill(C.brandSoft).restore();
  doc
    .fillColor(C.brand)
    .text(piNo, right - pillW, y + 8, {
      width: pillW,
      align: "center",
      characterSpacing: 0.8,
      lineBreak: false,
    });

  const issued = detail.pi.issuedAt
    ? detail.pi.issuedAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
  const sub: string[] = [];
  if (detail.smNumber) sub.push(`SM ${detail.smNumber}`);
  if (detail.negotiationNo) sub.push(detail.negotiationNo);
  sub.push(`Date ${issued}`);
  if (detail.pi.iteration) sub.push(`Rev ${detail.pi.iteration}`);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.inkMuted)
    .text(sub.join("   ·   "), left, y + nameH + 6, { width, lineBreak: false });

  doc.y = y + nameH + 28;
}

// ── Line-item table ─────────────────────────────────────────────────────────

const COLS = {
  no: 26,
  product: 0, // filled from remaining width
  qty: 58,
  unit: 92,
  total: 96,
} as const;

function drawTableHeader(
  doc: Doc,
  left: number,
  width: number,
  productW: number,
): void {
  const y = doc.y;
  doc.save().roundedRect(left, y, width, 20, 3).fill(C.brand).restore();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF");
  let x = left + 8;
  doc.text("#", x, y + 6, { width: COLS.no, lineBreak: false });
  x += COLS.no;
  doc.text("PRODUCT", x, y + 6, { width: productW, lineBreak: false, characterSpacing: 0.6 });
  x += productW;
  doc.text("QTY", x, y + 6, { width: COLS.qty, align: "right", lineBreak: false });
  x += COLS.qty;
  doc.text("REVISED UNIT", x, y + 6, { width: COLS.unit, align: "right", lineBreak: false });
  x += COLS.unit;
  doc.text("LINE TOTAL", x, y + 6, { width: COLS.total, align: "right", lineBreak: false });
  doc.y = y + 24;
}

function drawLineTable(
  doc: Doc,
  detail: Detail,
  left: number,
  width: number,
  right: number,
  ensure: (needed: number) => void,
): void {
  const productW = width - 16 - COLS.no - COLS.qty - COLS.unit - COLS.total;
  ensure(48);
  drawTableHeader(doc, left, width, productW);

  doc.font("Helvetica").fontSize(9);
  detail.items.forEach((it, i) => {
    const name = it.custProductName || it.partNo || "Line item";
    const nameH = doc.heightOfString(name, { width: productW });
    const rowH = Math.max(nameH + 10, 22);
    ensure(rowH + 2);
    const y = doc.y;
    if (i % 2 === 1) {
      doc.save().rect(left, y, width, rowH).fill(C.soft).restore();
    }
    let x = left + 8;
    doc.font("Helvetica").fontSize(9).fillColor(C.inkMuted);
    doc.text(String(i + 1), x, y + 5, { width: COLS.no, lineBreak: false });
    x += COLS.no;
    doc.fillColor(C.ink).text(name, x, y + 5, { width: productW });
    if (it.partNo && it.custProductName) {
      doc
        .font("Helvetica")
        .fontSize(6.8)
        .fillColor(C.inkSoft)
        .text(`Part ${it.partNo}`, x, y + 5 + nameH, { width: productW, lineBreak: false });
    }
    x += productW;
    doc.font("Helvetica").fontSize(9).fillColor(C.ink);
    doc.text(qtyStr(it.qty), x, y + 5, { width: COLS.qty, align: "right", lineBreak: false });
    x += COLS.qty;
    doc.text(money(it.revisedUnitPrice), x, y + 5, {
      width: COLS.unit,
      align: "right",
      lineBreak: false,
    });
    x += COLS.unit;
    doc
      .font("Helvetica-Bold")
      .text(money(it.revisedLineTotal), x, y + 5, {
        width: COLS.total,
        align: "right",
        lineBreak: false,
      });
    doc.y = y + rowH;
    doc
      .save()
      .strokeColor(C.hairline)
      .lineWidth(0.5)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
  });
  doc.y += 6;
}

function drawTotals(
  doc: Doc,
  detail: Detail,
  left: number,
  width: number,
  right: number,
  ensure: (needed: number) => void,
): void {
  ensure(30);
  const boxW = COLS.unit + COLS.total + 16;
  const x = right - boxW;
  const y = doc.y;
  doc.save().roundedRect(x, y, boxW, 26, 4).fill(C.brandSoft).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(C.brandDeep)
    .text("REVISED TOTAL", x + 10, y + 9, { lineBreak: false, characterSpacing: 0.6 });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(C.brand)
    .text(money(detail.pi.revisedTotal), x, y + 8, {
      width: boxW - 10,
      align: "right",
      lineBreak: false,
    });
  doc.y = y + 34;
  void left;
  void width;
}

function drawTerms(
  doc: Doc,
  detail: Detail,
  left: number,
  width: number,
  ensure: (needed: number) => void,
): void {
  const terms: Array<[string, string | null]> = [
    ["Validity", detail.pi.validity],
    ["Delivery Time", detail.pi.deliveryTime],
    ["Development Time", detail.pi.developmentTime],
  ];
  const rows = terms.filter(([, v]) => v && v.trim().length > 0);
  if (rows.length === 0) return;
  ensure(24 + rows.length * 16);
  drawSectionHeader(doc, "Commercial Terms", left, left + width);
  const colGap = 26;
  const colW = (width - colGap) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const l = rows[i]!;
    const r = rows[i + 1];
    ensure(20);
    const y = doc.y;
    drawKv(doc, l[0], l[1] ?? "—", left, y, colW);
    if (r) drawKv(doc, r[0], r[1] ?? "—", left + colW + colGap, y, colW);
    doc.y = y + 20;
  }
  doc.y += 4;
}

function drawNotes(
  doc: Doc,
  detail: Detail,
  left: number,
  width: number,
  ensure: (needed: number) => void,
): void {
  const notes = detail.pi.notes;
  if (!notes || notes.trim().length === 0) return;
  ensure(40);
  drawSectionHeader(doc, "Notes", left, left + width);
  const h = doc.heightOfString(notes, { width });
  ensure(h + 6);
  doc.font("Helvetica").fontSize(9.5).fillColor(C.ink).text(notes, left, doc.y, { width });
  doc.y += 8;
}

function drawKv(
  doc: Doc,
  label: string,
  value: string,
  x: number,
  y: number,
  colW: number,
): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(6.8)
    .fillColor(C.inkSoft)
    .text(label.toUpperCase(), x, y, { width: colW, characterSpacing: 0.8, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.ink)
    .text(value, x, y + 9, { width: colW, lineBreak: false });
}

function drawSectionHeader(doc: Doc, title: string, left: number, right: number): void {
  const y = doc.y;
  doc.save().rect(left, y, 3, 12).fill(C.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(C.brand)
    .text(title.toUpperCase(), left + 9, y + 1, { characterSpacing: 1.2, lineBreak: false });
  const labelW = doc.widthOfString(title.toUpperCase(), { characterSpacing: 1.2 });
  doc
    .save()
    .strokeColor(C.hairline)
    .lineWidth(0.8)
    .moveTo(left + 9 + labelW + 12, y + 7)
    .lineTo(right, y + 7)
    .stroke()
    .restore();
  doc.y = y + 20;
}

function drawContinuation(
  doc: Doc,
  detail: Detail,
  left: number,
  right: number,
): void {
  const y = doc.page.margins.top + 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(C.brand)
    .text("CARBIDE INDIA · PROFORMA INVOICE", left, y, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.inkSoft)
    .text(detail.pi.piNo ?? "", left, y, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
  doc.y = y + 18;
  doc
    .save()
    .strokeColor(C.hairline)
    .lineWidth(0.6)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 12;
}

function drawFooter(doc: Doc, left: number, right: number, page: number, total: number): void {
  const y = doc.page.height - doc.page.margins.bottom + 12;
  doc
    .save()
    .moveTo(left, y + 7)
    .lineTo(left + 6, y + 7)
    .lineTo(left + 3, y + 1)
    .closePath()
    .fill(C.brand)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(C.inkSoft)
    .text("CARBIDE INDIA · CONFIDENTIAL", left + 12, y + 1, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(C.inkSoft)
    .text(`Page ${page} of ${total}`, left, y + 1, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
}
