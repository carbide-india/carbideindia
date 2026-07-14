import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { getClientAutofill } from "@/lib/queries/clients";

export const runtime = "nodejs"; // postgres-js needs Node APIs

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Old-client auto-fetch for the New Inquiry form: returns the client's KYC
 * block + primary contact. The form copies these values into its own fields
 * (a snapshot - the inquiry never references the client row again).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }
  const data = await getClientAutofill(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
