import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Client Master export moved to `/clients/export.xlsx`. 308 keeps old
// bookmarks / links working (308 preserves the GET method).
export function GET(req: Request): Response {
  return NextResponse.redirect(new URL("/clients/export.xlsx", req.url), 308);
}
