import "server-only";
import { requireUser } from "@/lib/auth/current";
import { getSalesOrderDocInput } from "@/lib/queries/sales-orders";
import {
  buildSalesOrderDocument,
  salesOrderCopyFileStem,
  type SalesOrderCopy,
} from "@/lib/sales-orders/so-document";
import { renderSalesOrderPdf } from "@/lib/sales-orders/so-pdf";

/**
 * The shared body of the two Sales Order PDF routes
 * (`/sales-orders/[id]/customer-copy.pdf` and `.../factory-copy.pdf`).
 *
 * Both copies come off ONE loaded record and ONE renderer - only the `copy`
 * discriminator differs - so the customer PDF and the factory PDF can never
 * disagree about the order they describe.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function salesOrderCopyPdfResponse(
  request: Request,
  id: string,
  copy: SalesOrderCopy,
): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });

  const input = await getSalesOrderDocInput(id);
  if (!input) return new Response("Not found", { status: 404 });

  const document = buildSalesOrderDocument(input, copy);

  // Brand logo from the running origin (works in dev and on Vercel alike).
  const origin = new URL(request.url).origin;
  let logo: Buffer | null = null;
  try {
    const r = await fetch(`${origin}/brand/logo.png`, { cache: "no-store" });
    if (r.ok) logo = Buffer.from(await r.arrayBuffer());
  } catch {
    /* logo is optional - the wordmark still prints */
  }

  const buffer = await renderSalesOrderPdf(document, { logo });

  // ?view=1 opens inline (the "View" affordance); the default downloads.
  const inline = new URL(request.url).searchParams.get("view") === "1";
  const filename = `${salesOrderCopyFileStem(input.soNo, copy)}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
