import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher, clerkClient } from "@clerk/nextjs/server";
import { clientIpFromHeaders, isIpAllowed, isBypassEmail } from "@/lib/ip-gate";

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
  const ipOk = isIpAllowed(ip, process.env.ALLOWED_IPS);

  if (!ipOk) {
    // Public/auth routes (login, etc.) stay reachable from ANY IP so that the
    // bypass users can sign in remotely. Protected routes from a non-allowed
    // IP are permitted ONLY for allowlisted bypass emails (owners working
    // off-site); everyone else gets the branded denial page.
    if (!isPublicRoute(req)) {
      const { userId } = await auth();
      let bypass = false;
      if (userId) {
        try {
          const user = await (await clerkClient()).users.getUser(userId);
          const email =
            user.primaryEmailAddress?.emailAddress ??
            user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
            null;
          bypass = isBypassEmail(email);
        } catch {
          bypass = false;
        }
      }
      if (!bypass) {
        if (req.nextUrl.pathname === "/access-denied") return NextResponse.next();
        const url = req.nextUrl.clone();
        url.pathname = "/access-denied";
        return NextResponse.rewrite(url, { status: 403 });
      }
      // bypass user → fall through to Clerk auth below
    }
    // public route from a blocked IP → allow through (so they can reach /login)
  } else if (req.nextUrl.pathname === "/access-denied") {
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
