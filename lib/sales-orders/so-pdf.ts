import PDFDocument from "pdfkit";
import type {
  SalesOrderDocument,
  SoDocRow,
  SoDocSection,
} from "@/lib/sales-orders/so-document";
import { formatDateTime } from "@/lib/format";

/**
 * Renders a built Sales Order document (`buildSalesOrderDocument`) to a PDF.
 *
 * Same renderer, both copies - the ONLY thing that changes is the accent and the
 * internal marking, because the two copies must be recognisably the same order.
 * The layout mirrors the Client KYC PDF (indigo masthead, section rule, two
 * column label/value grid, numbered confidential footer) so every document that
 * leaves this system looks like it came from the same company.
 *
 * The FACTORY copy is marked internal three ways - an amber masthead accent and
 * band, a repeated diagonal watermark, and a footer line - so a page that ends
 * up in a customer's hands is obvious at a glance. Brand red (#D32F2F) is the
 * semantic/error role in this app and is deliberately NOT used for "internal".
 */

const C = {
  brand: "#3F3F94",
  brandDeep: "#2F2F6F",
  ink: "#14151A",
  inkMuted: "#4B5563",
  inkSoft: "#8A90A0",
  hairline: "#E5E7EB",
  soft: "#F4F5FA",
  green: "#15803D",
  greenBg: "#DCFCE7",
  slate: "#64748B",
  slateBg: "#EEF0F3",
  internal: "#B45309",
  internalDeep: "#92400E",
  internalBg: "#FEF3C7",
} as const;

type Doc = PDFKit.PDFDocument;

/**
 * pdfkit's built-in Helvetica is WinAnsi-encoded and has no ₹ glyph, so the
 * rupee sign the on-screen copy shows would print as a missing character. The
 * shared document model keeps ₹ (correct on screen); the PDF spells it. Any
 * other character outside WinAnsi is dropped rather than printed as a box.
 */
function winAnsi(text: string): string {
  return text
    .replace(/₹\s*/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    // Intl time formats can emit a narrow/thin no-break space before am/pm.
    .replace(/[    ]/g, " ");
}

interface Theme {
  accent: string;
  accentDeep: string;
}

export interface RenderOptions {
  /** Brand logo bytes; the wordmark still prints when absent. */
  logo: Buffer | null;
}

export async function renderSalesOrderPdf(
  doc0: SalesOrderDocument,
  opts: RenderOptions,
): Promise<Buffer> {
  const theme: Theme = doc0.internal
    ? { accent: C.internal, accentDeep: C.internalDeep }
    : { accent: C.brand, accentDeep: C.brandDeep };

  const doc = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: {
      Title: `Sales Order ${doc0.soNo} - ${doc0.copyLabel}`,
      Author: "Carbide India WMS",
      Subject: doc0.internal
        ? "Sales Order - Factory Copy (Internal)"
        : "Sales Order - Customer Copy",
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

  drawMasthead(doc, doc0, theme, opts.logo, left, right);
  drawIdentity(doc, doc0, left, right, width);
  if (doc0.internal) drawInternalBand(doc, left, width);

  const ensure = (needed: number) => {
    if (doc.y + needed > bottom - 26) {
      doc.addPage({ size: "A4", margin: 46 });
      drawTopStripe(doc, theme);
      doc.y = doc.page.margins.top + 6;
      drawContinuation(doc, doc0, theme, left, right);
    }
  };

  for (const section of doc0.sections) {
    ensure(40);
    drawSectionHeader(doc, section, theme, left, right);
    drawGrid(doc, section.rows, left, width, ensure);
    doc.y += 6;
  }

  if (doc0.lines.length > 0) {
    ensure(40);
    drawSectionHeader(
      doc,
      { title: "Products", rows: [] },
      theme,
      left,
      right,
    );
    for (const line of doc0.lines) {
      ensure(30);
      drawBlockHeading(doc, line.heading, theme, left, width);
      drawGrid(doc, line.rows, left, width, ensure);
      if (line.internalRows.length > 0) {
        ensure(24);
        drawInternalSubHeading(doc, left, width);
        drawGrid(doc, line.internalRows, left, width, ensure);
      }
      doc.y += 4;
    }
  }

  if (doc0.pendingFieldList) {
    ensure(64);
    drawPendingFieldNotice(doc, left, width);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    if (doc0.internal) drawWatermark(doc);
    drawFooter(doc, doc0, theme, left, right, i + 1, range.count);
  }

  doc.end();
  return done;
}

function drawTopStripe(doc: Doc, theme: Theme): void {
  doc.save().rect(0, 0, doc.page.width, 5).fill(theme.accent).restore();
  doc.save().rect(0, 5, doc.page.width, 1.5).fill(theme.accentDeep).restore();
}

function drawMasthead(
  doc: Doc,
  d: SalesOrderDocument,
  theme: Theme,
  logo: Buffer | null,
  left: number,
  right: number,
): void {
  drawTopStripe(doc, theme);
  const top = doc.page.margins.top + 4;
  let cursorX = left;
  if (logo) {
    try {
      doc.image(logo, left, top - 2, { height: 34 });
      cursorX = left + 44;
    } catch {
      /* fall through to wordmark only */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(C.brand)
    .text("CARBIDE INDIA", cursorX, top + 2, {
      characterSpacing: 1.6,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(C.inkSoft)
    .text("Your Tungsten Carbide & Tungsten Copper Partners", cursorX, top + 24, {
      characterSpacing: 0.4,
      lineBreak: false,
    });

  const generated = winAnsi(formatDateTime(new Date()));
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(theme.accentDeep)
    .text(`SALES ORDER · ${d.copyLabel.toUpperCase()}`, left, top, {
      width: right - left,
      align: "right",
      characterSpacing: 1.2,
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
  d: SalesOrderDocument,
  left: number,
  right: number,
  width: number,
): void {
  const y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(C.ink)
    .text(d.soNo, left, y, { width: width - 130 });
  const nameH = doc.heightOfString(d.soNo, { width: width - 130 });

  // Send-state pill for THIS copy (customer_so_sent vs production_so_sent).
  const pillBg = d.sent ? C.greenBg : C.slateBg;
  const pillFg = d.sent ? C.green : C.slate;
  const pillText = d.sent ? "SENT" : "NOT SENT";
  doc.font("Helvetica-Bold").fontSize(8.5);
  const pillW = doc.widthOfString(pillText, { characterSpacing: 0.8 }) + 18;
  doc.save().roundedRect(right - pillW, y + 2, pillW, 18, 9).fill(pillBg).restore();
  doc.fillColor(pillFg).text(pillText, right - pillW, y + 7, {
    width: pillW,
    align: "center",
    characterSpacing: 0.8,
    lineBreak: false,
  });

  const sub = [d.companyName, d.smNumber, d.statusLabel].filter(Boolean);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.inkMuted)
    .text(sub.join("   ·   "), left, y + nameH + 6, { width, lineBreak: false });

  doc.y = y + nameH + 26;
}

/** The amber "internal" band that opens every factory copy. */
function drawInternalBand(doc: Doc, left: number, width: number): void {
  const y = doc.y;
  doc.save().roundedRect(left, y, width, 26, 5).fill(C.internalBg).restore();
  doc.save().rect(left, y, 3.5, 26).fill(C.internal).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(C.internalDeep)
    .text(
      "INTERNAL - FACTORY COPY. Contains internal grades, production codes and shop-floor notes. Not for the customer.",
      left + 12,
      y + 9,
      { width: width - 24, lineBreak: false, ellipsis: true },
    );
  doc.y = y + 36;
}

function drawSectionHeader(
  doc: Doc,
  section: SoDocSection,
  theme: Theme,
  left: number,
  right: number,
): void {
  const y = doc.y;
  const color = section.internal ? C.internal : theme.accent;
  const title = section.internal
    ? `${section.title.toUpperCase()}  ·  INTERNAL`
    : section.title.toUpperCase();
  doc.save().rect(left, y, 3, 12).fill(color).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(color)
    .text(title, left + 9, y + 1, { characterSpacing: 1.2, lineBreak: false });
  const labelW = doc.widthOfString(title, { characterSpacing: 1.2 });
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

function drawBlockHeading(
  doc: Doc,
  heading: string,
  theme: Theme,
  left: number,
  width: number,
): void {
  const y = doc.y;
  doc.save().roundedRect(left, y, width, 18, 4).fill(C.soft).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(theme.accentDeep)
    .text(winAnsi(heading), left + 8, y + 5, {
      width: width - 16,
      lineBreak: false,
      ellipsis: true,
    });
  doc.y = y + 24;
}

function drawInternalSubHeading(doc: Doc, left: number, width: number): void {
  const y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(C.internal)
    .text("PRODUCTION DETAIL · INTERNAL", left, y, {
      width,
      characterSpacing: 1,
      lineBreak: false,
    });
  doc.y = y + 12;
}

function cellHeight(doc: Doc, row: SoDocRow, colW: number): number {
  doc.font("Helvetica").fontSize(10);
  return 12 + doc.heightOfString(winAnsi(row.value), { width: colW }) + 6;
}

function drawCell(
  doc: Doc,
  row: SoDocRow,
  x: number,
  y: number,
  colW: number,
): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(6.8)
    .fillColor(C.inkSoft)
    .text(winAnsi(row.label).toUpperCase(), x, y, {
      width: colW,
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.ink)
    .text(winAnsi(row.value), x, y + 11, { width: colW });
}

function drawGrid(
  doc: Doc,
  rowList: SoDocRow[],
  left: number,
  width: number,
  ensure: (needed: number) => void,
): void {
  const colGap = 26;
  const colW = (width - colGap) / 2;
  for (let i = 0; i < rowList.length; i += 2) {
    const l = rowList[i]!;
    const r = rowList[i + 1];
    const lineH = Math.max(
      cellHeight(doc, l, colW),
      r ? cellHeight(doc, r, colW) : 0,
    );
    ensure(lineH);
    const y = doc.y;
    drawCell(doc, l, left, y, colW);
    if (r) drawCell(doc, r, left + colW + colGap, y, colW);
    doc.y = y + lineH;
  }
}

/**
 * The honest gap. Manan asked for the factory copy but said the exact extra
 * fields must be collected from Alok in a separate sitting - so the sheet says
 * so, in place, rather than shipping an invented spec sheet the shop floor
 * would trust.
 */
function drawPendingFieldNotice(doc: Doc, left: number, width: number): void {
  const y = doc.y + 4;
  const text =
    "Additional production fields are still to be confirmed with Alok. This copy currently prints the internal " +
    "grade, internal production code, production part no and production notes already held against each product. " +
    "Any further shop-floor detail will be added here once the field list is agreed.";
  doc.font("Helvetica").fontSize(8);
  const h = doc.heightOfString(text, { width: width - 24 }) + 30;
  doc.save().roundedRect(left, y, width, h, 5).fill(C.soft).restore();
  doc.save().rect(left, y, 3.5, h).fill(C.internal).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(C.internalDeep)
    .text("PENDING - PRODUCTION FIELD LIST", left + 12, y + 9, {
      characterSpacing: 1,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.inkMuted)
    .text(text, left + 12, y + 22, { width: width - 24 });
  doc.y = y + h + 8;
}

function drawContinuation(
  doc: Doc,
  d: SalesOrderDocument,
  theme: Theme,
  left: number,
  right: number,
): void {
  const y = doc.page.margins.top + 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(theme.accent)
    .text(`CARBIDE INDIA · SALES ORDER · ${d.copyLabel.toUpperCase()}`, left, y, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.inkSoft)
    .text(`${d.soNo}${d.companyName ? ` · ${d.companyName}` : ""}`, left, y, {
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

/** Faint diagonal INTERNAL watermark - factory copy only. */
function drawWatermark(doc: Doc): void {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.rotate(-32, { origin: [cx, cy] });
  doc
    .font("Helvetica-Bold")
    .fontSize(64)
    .fillColor(C.internal)
    .fillOpacity(0.07)
    .text("FACTORY COPY", cx - 300, cy - 40, {
      width: 600,
      align: "center",
      characterSpacing: 4,
      lineBreak: false,
    });
  doc.fillOpacity(1);
  doc.restore();
}

function drawFooter(
  doc: Doc,
  d: SalesOrderDocument,
  theme: Theme,
  left: number,
  right: number,
  page: number,
  total: number,
): void {
  const y = doc.page.height - doc.page.margins.bottom + 12;
  doc
    .save()
    .moveTo(left, y + 7)
    .lineTo(left + 6, y + 7)
    .lineTo(left + 3, y + 1)
    .closePath()
    .fill(theme.accent)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(d.internal ? C.internalDeep : C.inkSoft)
    .text(
      d.internal
        ? "CARBIDE INDIA · INTERNAL FACTORY COPY · NOT FOR THE CUSTOMER"
        : "CARBIDE INDIA · CONFIDENTIAL",
      left + 12,
      y + 1,
      { characterSpacing: 1.2, lineBreak: false },
    );
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
