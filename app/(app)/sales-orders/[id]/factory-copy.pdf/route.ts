import { salesOrderCopyPdfResponse } from "@/lib/sales-orders/copy-response";

/**
 * GET /sales-orders/[id]/factory-copy.pdf
 *
 * Output 2 of 2: the FACTORY / production copy - everything the customer copy
 * shows PLUS the internal production detail (item code, internal grade,
 * internal production code, production part no, header + per-line production
 * notes) so the shop floor can start making material. Marked internal on every
 * page. The exact extra field list is still to be confirmed with Alok, so the
 * sheet prints a visible "pending" notice rather than an invented spec.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return salesOrderCopyPdfResponse(request, id, "factory");
}
