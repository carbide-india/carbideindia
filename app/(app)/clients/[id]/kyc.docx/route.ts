import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  HeadingLevel,
} from "docx";
import { requireUser } from "@/lib/auth/current";
import { getClientRecord } from "@/lib/queries/clients";
import { buildKycDocument, kycFileStem, type KycDocRow } from "@/lib/clients/kyc-document";

/**
 * GET /clients/[id]/kyc.docx
 *
 * A polished, brand-consistent Word document of the whole Client KYC record -
 * the editable sibling of kyc.pdf. Same masthead (logo + CARBIDE INDIA), same
 * sections and fields (via buildKycDocument), rendered as clean label/value
 * tables so staff can tweak and re-share.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BRAND = "3F3F94";
const BRAND_DEEP = "2F2F6F";
const INK = "14151A";
const INK_SOFT = "8A90A0";
const HAIRLINE = "E5E7EB";
const SOFT = "F4F5FA";

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
  const kyc = buildKycDocument(rec);

  // Brand logo from the running origin (reliable in dev + on Vercel).
  const origin = new URL(request.url).origin;
  let logo: { data: Buffer; width: number; height: number } | null = null;
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) {
      const data = Buffer.from(await r.arrayBuffer());
      // Parse PNG IHDR for the true aspect ratio (avoids distortion).
      const w = data.readUInt32BE(16);
      const h = data.readUInt32BE(20);
      const targetH = 46;
      logo = { data, width: Math.round((targetH * w) / h), height: targetH };
    }
  } catch {
    /* logo optional */
  }

  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const children: (Paragraph | Table)[] = [];

  // ── Masthead ──
  if (logo) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: logo.data,
            transformation: { width: logo.width, height: logo.height },
          }),
        ],
      }),
    );
  }
  children.push(
    new Paragraph({
      spacing: { before: logo ? 60 : 0, after: 0 },
      children: [
        new TextRun({ text: "CARBIDE INDIA", bold: true, color: BRAND, size: 30, characterSpacing: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Your Tungsten Carbide & Tungsten Copper Partners",
          color: INK_SOFT,
          size: 15,
        }),
      ],
    }),
    new Paragraph({
      border: { bottom: { color: HAIRLINE, style: BorderStyle.SINGLE, size: 8, space: 6 } },
      spacing: { after: 160 },
      children: [
        new TextRun({ text: "CLIENT KYC", bold: true, color: INK, size: 20, characterSpacing: 14 }),
        new TextRun({ text: `     Generated ${generated}`, color: INK_SOFT, size: 15 }),
      ],
    }),
  );

  // ── Identity ──
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 40 },
      children: [new TextRun({ text: kyc.clientName, bold: true, color: INK, size: 40 })],
    }),
  );
  const subParts: string[] = [];
  if (kyc.clientCode) subParts.push(kyc.clientCode);
  if (kyc.gstin) subParts.push(`GSTIN ${kyc.gstin}`);
  subParts.push(kyc.status);
  children.push(
    new Paragraph({
      spacing: { after: 220 },
      children: [new TextRun({ text: subParts.join("   ·   "), color: BRAND_DEEP, size: 19, bold: true })],
    }),
  );

  // ── Sections ──
  for (const section of kyc.sections) {
    children.push(sectionHeading(section.title));
    if (section.rows && section.rows.length > 0) {
      children.push(kvTable(section.rows));
      children.push(spacer());
    }
    for (const block of section.blocks ?? []) {
      children.push(blockHeading(block.heading));
      children.push(kvTable(block.rows));
      children.push(spacer());
    }
  }

  const doc = new Document({
    creator: "Carbide India WMS",
    title: `Client KYC - ${kyc.clientName}`,
    styles: {
      default: {
        document: { run: { font: "Calibri", color: INK } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
        footers: undefined,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${kycFileStem(rec)}.docx"`,
      "cache-control": "no-store",
    },
  });
}

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    border: { bottom: { color: HAIRLINE, style: BorderStyle.SINGLE, size: 6, space: 4 } },
    children: [
      new TextRun({ text: title.toUpperCase(), bold: true, color: BRAND, size: 19, characterSpacing: 12 }),
    ],
  });
}

function blockHeading(heading: string): Paragraph {
  return new Paragraph({
    spacing: { before: 100, after: 40 },
    shading: { type: "clear", fill: SOFT, color: "auto" },
    children: [new TextRun({ text: heading, bold: true, color: BRAND_DEEP, size: 17 })],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

function kvTable(rowList: KycDocRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideVertical: NO_BORDER,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: HAIRLINE },
    },
    rows: rowList.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              margins: { top: 40, bottom: 40, left: 20, right: 20 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: row.label.toUpperCase(), bold: true, color: INK_SOFT, size: 14, characterSpacing: 8 }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              margins: { top: 40, bottom: 40, left: 20, right: 20 },
              children: [new Paragraph({ children: [new TextRun({ text: row.value, color: INK, size: 19 })] })],
            }),
          ],
        }),
    ),
  });
}
