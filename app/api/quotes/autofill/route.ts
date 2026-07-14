import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { getQuoteAutofill } from "@/lib/queries/quotes";

export const runtime = "nodejs"; // postgres-js needs Node APIs

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SM auto-fetch for the Quotation / Negotiation / Sales-Order forms: returns
 * the linked enquiry's snapshot block (company, dates, sales person, product,
 * qty, grade/tolerance/condition names). The form copies these into its own
 * editable fields - a snapshot, never re-synced.
 */
export async function GET(req: Request) {
  await requireUser();
  const inquiryId = new URL(req.url).searchParams.get("inquiryId") ?? "";
  if (!UUID_RE.test(inquiryId)) {
    return NextResponse.json({ error: "Invalid inquiry id" }, { status: 400 });
  }
  const data = await getQuoteAutofill(inquiryId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
