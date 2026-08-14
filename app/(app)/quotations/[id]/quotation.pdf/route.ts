import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth/current";
import { getQuotationById } from "@/lib/queries/quotations";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * GET /quotations/[id]/quotation.pdf
 *
 * The customer-facing quotation: an indigo masthead with the Carbide India
 * wordmark, the quote identity block (Quote No / date / customer), the product
 * and price, the commercial terms (validity / delivery / development time) and
 * a signature line. Generated on demand — no stored file.
 *
 * Structure deliberately mirrors the Proforma Invoice and Client KYC routes so
 * every document Carbide sends out reads as the same company.
 *
 * `?view=1` renders inline (for the pre-send preview); the default is an
 * attachment download, and `sendQuotation` attaches these same bytes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const C = {
  brand: "#3F3F94",
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

function text(v: string | null | undefined): string {
  return v && v.trim() ? v.trim() : "—";
}

type Doc = PDFKit.PDFDocument;
type Quotation = NonNullable<Awaited<ReturnType<typeof getQuotationById>>>;

/** Render the quotation PDF. Exported so the send action attaches the SAME
 *  bytes the preview showed — not a second, subtly different document. */
export async function renderQuotationPdf(
  quotation: Quotation,
  opts: { logo: Buffer | null },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: {
      Title: `Quotation - ${quotation.quoteNo}`,
      Author: "Carbide India WMS",
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

  drawMasthead(doc, opts.logo, left, right);
  drawIdentity(doc, quotation, left, width);
  drawProduct(doc, quotation, left, width);
  drawPrice(doc, quotation, left, width, right);
  drawTerms(doc, quotation, left, width);
  drawSignature(doc, left, width);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, left, right, i + 1, range.count);
  }

  doc.end();
  return done;
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

  const quotation = await getQuotationById(id);
  if (!quotation) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const logo = await loadLogo(origin);

  const buffer = await renderQuotationPdf(quotation, { logo });
  const stem = quotation.quoteNo.replace(/[^\w.-]+/g, "_");
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

/** The masthead logo. Optional — the wordmark alone still reads as Carbide. */
export async function loadLogo(origin: string): Promise<Buffer | null> {
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  } catch {
    /* optional */
  }
  return null;
}

function drawTopStripe(doc: Doc): void {
  doc.save().rect(0, 0, doc.page.width, 5).fill(C.brand).restore();
}

function drawMasthead(doc: Doc, logo: Buffer | null, left: number, right: number): void {
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
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(C.ink)
    .text("QUOTATION", left, top, {
      width: right - left,
      align: "right",
      characterSpacing: 1.4,
      lineBreak: false,
    });
  doc.y = top + 44;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor(C.hairline).stroke();
  doc.y += 14;
}

/** Two-column key/value block. */
function pairs(
  doc: Doc,
  rows: [string, string][],
  left: number,
  width: number,
): void {
  const colW = width / 2;
  const rowH = 17;
  rows.forEach(([label, value], i) => {
    const x = left + (i % 2) * colW;
    const y = doc.y + Math.floor(i / 2) * rowH;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(C.inkSoft)
      .text(label.toUpperCase(), x, y, { characterSpacing: 0.6, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(C.ink)
      .text(value, x + 108, y - 1, { width: colW - 112, lineBreak: false });
  });
  doc.y += Math.ceil(rows.length / 2) * rowH + 8;
}

function sectionTitle(doc: Doc, label: string, left: number, width: number): void {
  doc
    .save()
    .rect(left, doc.y, width, 20)
    .fill(C.soft)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(C.brand)
    .text(label.toUpperCase(), left + 8, doc.y + 6, { characterSpacing: 1, lineBreak: false });
  doc.y += 28;
}

function drawIdentity(doc: Doc, q: Quotation, left: number, width: number): void {
  pairs(
    doc,
    [
      ["Quote No", q.quoteNo],
      ["Date", formatDate(q.createdAt)],
      ["Customer", text(q.companyName)],
      ["Enquiry Date", q.enquiryDate ? formatDate(q.enquiryDate) : "—"],
    ],
    left,
    width,
  );
}

function drawProduct(doc: Doc, q: Quotation, left: number, width: number): void {
  sectionTitle(doc, "Product", left, width);
  pairs(
    doc,
    [
      ["Product", text(q.custProductName)],
      ["Part No", text(q.partNo)],
      ["Drawing No", text(q.custDrawingNo)],
      ["Revision", text(q.drawingRevisionNo)],
      ["Grade", text(q.gradeNameForCust ?? q.gradeCustomer)],
      ["Tolerance", text(q.tolerance)],
      ["Condition", text(q.condition)],
      ["Quantity", text(q.qty)],
    ],
    left,
    width,
  );
}

function drawPrice(doc: Doc, q: Quotation, left: number, width: number, right: number): void {
  sectionTitle(doc, "Price", left, width);
  const boxY = doc.y;
  doc.save().rect(left, boxY, width, 42).fill(C.brandSoft).restore();
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.inkMuted)
    .text("Quoted price per piece", left + 12, boxY + 9, { lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(C.brand)
    .text(money(q.quotePrice), left, boxY + 10, {
      width: width - 12,
      align: "right",
      lineBreak: false,
    });
  doc.y = boxY + 54;
  void right;
}

function drawTerms(doc: Doc, q: Quotation, left: number, width: number): void {
  sectionTitle(doc, "Commercial Terms", left, width);
  pairs(
    doc,
    [
      ["Validity", text(q.validity)],
      ["Delivery Time", text(q.deliveryTime)],
      ["Development Time", text(q.developmentTime)],
      ["Currency", "INR"],
    ],
    left,
    width,
  );
}

function drawSignature(doc: Doc, left: number, width: number): void {
  doc.y += 18;
  const y = doc.y;
  doc
    .moveTo(left + width - 190, y + 30)
    .lineTo(left + width, y + 30)
    .lineWidth(1)
    .strokeColor(C.hairline)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(C.inkSoft)
    .text("For Carbide India", left + width - 190, y + 36, { lineBreak: false });
}

function drawFooter(doc: Doc, left: number, right: number, page: number, total: number): void {
  const y = doc.page.height - doc.page.margins.bottom + 6;
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(C.inkSoft)
    .text(
      `Yogeshwar Engineering Pvt Ltd  ·  W-150(A) MIDC Ambad, Nashik  ·  carbideindia.com`,
      left,
      y,
      { lineBreak: false },
    );
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(C.inkSoft)
    .text(`Generated ${formatDateTime(new Date())}  ·  Page ${page} of ${total}`, left, y, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
}
