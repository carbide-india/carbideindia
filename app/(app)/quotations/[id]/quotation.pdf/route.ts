import { requireUser } from "@/lib/auth/current";
import { getQuotationPdfModel } from "@/lib/queries/quotations";
import { renderQuotationPdf } from "@/lib/pdf/quotation-pdf";

/**
 * GET /quotations/[id]/quotation.pdf
 *
 * The customer-facing quotation, rendered to match Carbide India's official
 * quotation form (legal entity Yogeshwar Engg. Pvt Ltd) exactly. The drawing
 * lives in `lib/pdf/quotation-pdf.ts` (pure, no auth/DB); this route resolves
 * the print model, loads the logo, and streams the bytes.
 *
 * `?view=1` renders inline (for the pre-send preview); the default is an
 * attachment download, and `sendQuotation` attaches these same bytes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Re-exported so the send action can import both from the route it already
// depends on (`renderQuotationPdf` now lives in the pure module).
export { renderQuotationPdf } from "@/lib/pdf/quotation-pdf";

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

  const model = await getQuotationPdfModel(id);
  if (!model) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const logo = await loadLogo(origin);

  const buffer = await renderQuotationPdf(model, { logo });
  const stem = model.quoteNo.replace(/[^\w.-]+/g, "_");
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

/** The masthead logo. Optional — the company block alone still identifies the
 *  sender. */
export async function loadLogo(origin: string): Promise<Buffer | null> {
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  } catch {
    /* optional */
  }
  return null;
}
