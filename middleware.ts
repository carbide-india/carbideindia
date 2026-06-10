import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clientIpFromHeaders, isIpAllowed } from "@/lib/ip-gate";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/access-denied",
  "/welcome",
  "/terms",
  "/privacy",
  "/api/health",
  "/api/cron/(.*)", // authenticated by CRON_SECRET inside the route
  "/manifest.json",
  "/sw.js",
]);

export default clerkMiddleware(async (auth, req) => {
  // ── IP gate: runs before auth, before everything ──────────────
  const ip = clientIpFromHeaders(req.headers);
  if (!isIpAllowed(ip, process.env.ALLOWED_IPS)) {
    if (req.nextUrl.pathname === "/access-denied") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/access-denied";
    return NextResponse.rewrite(url, { status: 403 });
  }
  if (req.nextUrl.pathname === "/access-denied") {
    // Allowed visitors never see the denial page.
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ── Clerk auth ─────────────────────────────────────────────────
  if (!isPublicRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/login", req.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
