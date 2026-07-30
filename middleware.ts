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
      const { userId, sessionClaims } = await auth();
      let bypass = false;
      if (userId) {
        // Fast path: if the (Clerk-signed) session token carries an email claim,
        // decide with ZERO network calls. Configure this in the Clerk dashboard
        // → Sessions → Customize token: {"email":"{{user.primary_email_address}}"}.
        const claimEmail =
          typeof (sessionClaims as { email?: unknown } | undefined)?.email === "string"
            ? ((sessionClaims as { email?: string }).email ?? null)
            : null;
        if (claimEmail) {
          bypass = isBypassEmail(claimEmail);
        } else {
          // Fallback: look the user up — but BOUNDED, so a slow/cold Clerk API
          // call can never hang the gate (previously it could stall ~30s). On
          // timeout or error we fail CLOSED (deny), never open; the user just
          // retries and the warm call resolves.
          try {
            const client = await clerkClient();
            const user = await Promise.race([
              client.users.getUser(userId),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("clerk getUser timeout")), 3500),
              ),
            ]);
            const email =
              user.primaryEmailAddress?.emailAddress ??
              user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
              null;
            bypass = isBypassEmail(email);
          } catch {
            bypass = false;
          }
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
