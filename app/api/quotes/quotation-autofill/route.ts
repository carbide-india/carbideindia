import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { getQuotationAutofill } from "@/lib/queries/quotes";

export const runtime = "nodejs"; // postgres-js needs Node APIs

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quotation auto-fetch for the Negotiation / Sales-Order "Linked Quotation"
 * picker: returns price/timeline/validity/link from the chosen quote so the
 * form can prefill them.
 */
export async function GET(req: Request) {
  await requireUser();
  const quotationId = new URL(req.url).searchParams.get("quotationId") ?? "";
  if (!UUID_RE.test(quotationId)) {
    return NextResponse.json({ error: "Invalid quotation id" }, { status: 400 });
  }
  const data = await getQuotationAutofill(quotationId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
