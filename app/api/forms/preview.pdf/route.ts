import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth/current";
import {
  FormSnapshotSchema,
  formSnapshotFileStem,
  type FormSnapshot,
  type FormSnapshotRow,
} from "@/lib/documents/form-snapshot";

/**
 * POST /api/forms/preview.pdf
 *
 * Renders a filled-in form as a branded PDF. Takes the snapshot in the request
 * body rather than a record id, because the point is to see the form BEFORE it
 * is saved — there is nothing in the database to fetch yet. An unsaved snapshot
 * is stamped DRAFT on every page so it can never be filed as the real document.
 *
 * Visual language matches the existing record PDFs (clients/[id]/kyc.pdf,
 * sales-orders/[id]/*-copy.pdf): indigo masthead, sectioned two-column grid,
 * numbered confidential footer.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  brand: "#3F3F94",
  brandDeep: "#2F2F6F",
  ink: "#14151A",
  inkMuted: "#4B5563",
  inkSoft: "#8A90A0",
  hairline: "#E5E7EB",
  soft: "#F4F5FA",
  draft: "#D32F2F",
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = FormSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.issues[0]?.message ?? "Invalid snapshot", {
      status: 400,
    });
  }
  const snap = parsed.data;

  // The masthead logo is fetched from the running origin (works in dev and on
  // Vercel); it is optional — the wordmark still prints without it.
  let logo: Buffer | null = null;
  try {
    const origin = new URL(request.url).origin;
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) logo = Buffer.from(await r.arrayBuffer());
  } catch {
    /* optional */
  }

  const buffer = await render(snap, logo);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      // Inline: the button opens it in a tab to read, not to download.
      "content-disposition": `inline; filename="${formSnapshotFileStem(snap)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type Doc = PDFKit.PDFDocument;

async function render(snap: FormSnapshot, logo: Buffer | null): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: {
      Title: snap.draft ? `${snap.title} (draft)` : snap.title,
      Author: "Carbide India WMS",
      Subject: snap.title,
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

  drawMasthead(doc, snap, logo, left, right);

  const ensure = (needed: number) => {
    if (doc.y + needed > bottom - 26) {
      doc.addPage({ size: "A4", margin: 46 });
      drawTopStripe(doc);
      doc.y = doc.page.margins.top + 6;
      drawContinuation(doc, snap, left, right);
    }
  };

  for (const section of snap.sections) {
    if (section.rows.length === 0) continue;
    ensure(40);
    if (section.title) drawSectionHeader(doc, section.title, left, right);
    drawGrid(doc, section.rows, left, width, ensure);
    doc.y += 6;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    if (snap.draft) drawDraftStamp(doc);
    drawFooter(doc, snap, left, right, i + 1, range.count);
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
  snap: FormSnapshot,
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
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(C.ink)
    .text(snap.title.toUpperCase(), left, top, {
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

  if (snap.subtitle) {
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(C.ink)
      .text(snap.subtitle, left, doc.y, { width: right - left });
    doc.y += 8;
  }

  if (snap.draft) {
    const label = "DRAFT — NOT SAVED";
    doc.font("Helvetica-Bold").fontSize(8);
    const w = doc.widthOfString(label, { characterSpacing: 0.9 }) + 18;
    doc.save().roundedRect(left, doc.y, w, 18, 9).fill("#FDEEEE").restore();
    doc
      .fillColor(C.draft)
      .text(label, left, doc.y + 5, {
        width: w,
        align: "center",
        characterSpacing: 0.9,
        lineBreak: false,
      });
    doc.y += 28;
  }
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

function cellHeight(doc: Doc, row: FormSnapshotRow, colW: number): number {
  doc.font("Helvetica").fontSize(10);
  return 12 + doc.heightOfString(row.value || " ", { width: colW }) + 6;
}

function drawCell(doc: Doc, row: FormSnapshotRow, x: number, y: number, colW: number): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(6.8)
    .fillColor(C.inkSoft)
    .text(row.label.toUpperCase(), x, y, {
      width: colW,
      characterSpacing: 0.8,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.ink)
    .text(row.value || " ", x, y + 11, { width: colW });
}

function drawGrid(
  doc: Doc,
  rows: FormSnapshotRow[],
  left: number,
  width: number,
  ensure: (needed: number) => void,
): void {
  const colGap = 26;
  const colW = (width - colGap) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const l = rows[i]!;
    const r = rows[i + 1];
    const lineH = Math.max(cellHeight(doc, l, colW), r ? cellHeight(doc, r, colW) : 0);
    ensure(lineH);
    const y = doc.y;
    drawCell(doc, l, left, y, colW);
    if (r) drawCell(doc, r, left + colW + colGap, y, colW);
    doc.y = y + lineH;
  }
}

function drawContinuation(doc: Doc, snap: FormSnapshot, left: number, right: number): void {
  const y = doc.page.margins.top + 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(C.brand)
    .text(`CARBIDE INDIA · ${snap.title.toUpperCase()}`, left, y, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
  if (snap.subtitle) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(C.inkSoft)
      .text(snap.subtitle, left, y, { width: right - left, align: "right", lineBreak: false });
  }
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

/** Diagonal DRAFT watermark — unmistakable at a glance, light enough to read through. */
function drawDraftStamp(doc: Doc): void {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.rotate(-32, { origin: [cx, cy] });
  doc
    .font("Helvetica-Bold")
    .fontSize(96)
    .fillColor(C.draft)
    .opacity(0.07)
    .text("DRAFT", cx - 260, cy - 60, {
      width: 520,
      align: "center",
      characterSpacing: 6,
      lineBreak: false,
    });
  doc.opacity(1).restore();
}

function drawFooter(
  doc: Doc,
  snap: FormSnapshot,
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
    .fill(C.brand)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(C.inkSoft)
    .text(
      snap.draft ? "CARBIDE INDIA · DRAFT — NOT SAVED" : "CARBIDE INDIA · CONFIDENTIAL",
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
