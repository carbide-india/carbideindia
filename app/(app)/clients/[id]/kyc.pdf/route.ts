import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth/current";
import { getClientRecord } from "@/lib/queries/clients";
import { buildKycDocument, kycFileStem, type KycDocRow } from "@/lib/clients/kyc-document";
import { formatDateTime } from "@/lib/format";

/**
 * GET /clients/[id]/kyc.pdf
 *
 * A polished, brand-consistent PDF of the whole Client KYC record: an indigo
 * masthead with the Carbide India logo + wordmark, the client identity block,
 * then every KYC section laid out as a clean two-column label/value grid with
 * page-break-aware flow and a numbered confidential footer. Field content comes
 * from buildKycDocument() so it always matches the Word export.
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
  green: "#15803D",
  greenBg: "#DCFCE7",
  slate: "#64748B",
  slateBg: "#EEF0F3",
} as const;

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

  const rec = await getClientRecord(id);
  if (!rec) return new Response("Not found", { status: 404 });

  const doc = buildKycDocument(rec);

  // Fetch the brand logo from the running origin (reliable in dev + on Vercel).
  const origin = new URL(request.url).origin;
  let logo: Buffer | null = null;
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) logo = Buffer.from(await r.arrayBuffer());
  } catch {
    /* logo is optional - the wordmark still prints */
  }

  const buffer = await render(doc, { logo });
  // ?view=1 opens the PDF inline in the browser (the row-menu "View form");
  // the default (download buttons) forces an attachment.
  const inline = new URL(request.url).searchParams.get("view") === "1";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${kycFileStem(rec)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type Doc = PDFKit.PDFDocument;

async function render(
  kyc: ReturnType<typeof buildKycDocument>,
  opts: { logo: Buffer | null },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: {
      Title: `Client KYC - ${kyc.clientName}`,
      Author: "Carbide India WMS",
      Subject: "Client KYC Record",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  drawMasthead(doc, kyc, opts.logo, left, right);
  drawIdentity(doc, kyc, left, right, width);

  const ensure = (needed: number) => {
    if (doc.y + needed > bottom - 26) {
      doc.addPage({ size: "A4", margin: 46 });
      drawTopStripe(doc);
      doc.y = doc.page.margins.top + 6;
      drawContinuation(doc, kyc, left, right);
    }
  };

  for (const section of kyc.sections) {
    ensure(40);
    drawSectionHeader(doc, section.title, left, right);
    if (section.rows && section.rows.length > 0) {
      drawGrid(doc, section.rows, left, width, ensure);
    }
    for (const block of section.blocks ?? []) {
      ensure(28);
      drawBlockHeading(doc, block.heading, left, width);
      drawGrid(doc, block.rows, left, width, ensure);
    }
    doc.y += 6;
  }

  // Footer on every page.
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
  kyc: ReturnType<typeof buildKycDocument>,
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
      /* fall through to wordmark only */
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

  // Right meta column.
  const generated = formatDateTime(new Date());
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(C.ink)
    .text("CLIENT KYC", left, top, { width: right - left, align: "right", characterSpacing: 1.4, lineBreak: false });
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
  kyc: ReturnType<typeof buildKycDocument>,
  left: number,
  right: number,
  width: number,
): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.ink).text(kyc.clientName, left, y, {
    width: width - 120,
  });
  const nameH = doc.heightOfString(kyc.clientName, { width: width - 120 });

  // Status pill (top-right of the identity block).
  const isActive = kyc.status.toLowerCase() === "active";
  const pillBg = isActive ? C.greenBg : C.slateBg;
  const pillFg = isActive ? C.green : C.slate;
  doc.font("Helvetica-Bold").fontSize(8.5);
  const pillW = doc.widthOfString(kyc.status.toUpperCase(), { characterSpacing: 0.8 }) + 18;
  doc.save().roundedRect(right - pillW, y + 2, pillW, 18, 9).fill(pillBg).restore();
  doc
    .fillColor(pillFg)
    .text(kyc.status.toUpperCase(), right - pillW, y + 7, {
      width: pillW,
      align: "center",
      characterSpacing: 0.8,
      lineBreak: false,
    });

  const sub: string[] = [];
  if (kyc.clientCode) sub.push(kyc.clientCode);
  if (kyc.gstin) sub.push(`GSTIN ${kyc.gstin}`);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.inkMuted)
    .text(sub.join("   ·   "), left, y + nameH + 6, { width, lineBreak: false });

  doc.y = y + nameH + 26;
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

function drawBlockHeading(doc: Doc, heading: string, left: number, width: number): void {
  const y = doc.y;
  doc.save().roundedRect(left, y, width, 18, 4).fill(C.soft).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(C.brandDeep)
    .text(heading, left + 8, y + 5, { width: width - 16, lineBreak: false, ellipsis: true });
  doc.y = y + 24;
}

function cellHeight(doc: Doc, row: KycDocRow, colW: number): number {
  doc.font("Helvetica").fontSize(10);
  const valH = doc.heightOfString(row.value, { width: colW });
  return 12 /* label */ + valH + 6;
}

function drawCell(doc: Doc, row: KycDocRow, x: number, y: number, colW: number): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(6.8)
    .fillColor(C.inkSoft)
    .text(row.label.toUpperCase(), x, y, { width: colW, characterSpacing: 0.8, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.ink)
    .text(row.value, x, y + 11, { width: colW });
}

function drawGrid(
  doc: Doc,
  rowList: KycDocRow[],
  left: number,
  width: number,
  ensure: (needed: number) => void,
): void {
  const colGap = 26;
  const colW = (width - colGap) / 2;
  for (let i = 0; i < rowList.length; i += 2) {
    const l = rowList[i]!;
    const r = rowList[i + 1];
    const lineH = Math.max(cellHeight(doc, l, colW), r ? cellHeight(doc, r, colW) : 0);
    ensure(lineH);
    const y = doc.y;
    drawCell(doc, l, left, y, colW);
    if (r) drawCell(doc, r, left + colW + colGap, y, colW);
    doc.y = y + lineH;
  }
}

function drawContinuation(
  doc: Doc,
  kyc: ReturnType<typeof buildKycDocument>,
  left: number,
  right: number,
): void {
  const y = doc.page.margins.top + 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(C.brand)
    .text("CARBIDE INDIA · CLIENT KYC", left, y, { characterSpacing: 1.2, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.inkSoft)
    .text(kyc.clientName, left, y, { width: right - left, align: "right", lineBreak: false });
  doc.y = y + 18;
  doc.save().strokeColor(C.hairline).lineWidth(0.6).moveTo(left, doc.y).lineTo(right, doc.y).stroke().restore();
  doc.y += 12;
}

function drawFooter(doc: Doc, left: number, right: number, page: number, total: number): void {
  const y = doc.page.height - doc.page.margins.bottom + 12;
  doc.save().moveTo(left, y + 7).lineTo(left + 6, y + 7).lineTo(left + 3, y + 1).closePath().fill(C.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(C.inkSoft)
    .text("CARBIDE INDIA · CONFIDENTIAL", left + 12, y + 1, { characterSpacing: 1.2, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(C.inkSoft)
    .text(`Page ${page} of ${total}`, left, y + 1, { width: right - left, align: "right", lineBreak: false });
}
