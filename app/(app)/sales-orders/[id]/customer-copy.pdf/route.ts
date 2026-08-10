import { salesOrderCopyPdfResponse } from "@/lib/sales-orders/copy-response";

/**
 * GET /sales-orders/[id]/customer-copy.pdf
 *
 * Output 1 of 2: the CUSTOMER copy - order header, customer PO, commercial
 * terms and the per-product customer-facing spec. Never carries the internal
 * grade, internal production code, item code or any production note.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return salesOrderCopyPdfResponse(request, id, "customer");
}
