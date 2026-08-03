import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromHeaders, isIpAllowed, isBypassEmail } from "@/lib/ip-gate";

// Public routes reachable without a session (and from any IP, so bypass users can
// sign in remotely). /api/auth/session MUST be public — it mints the session
// cookie during login, before any cookie exists.
const PUBLIC_PATTERNS: RegExp[] = [
  /^\/login(\/.*)?$/,
  /^\/access-denied$/,
  /^\/welcome$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/api\/health$/,
  /^\/api\/cron\//, // authenticated by CRON_SECRET inside the route
  /^\/api\/auth\//, // session mint/clear
  // Vercel Blob client-upload token routes. These MUST be public so Blob's
  // server-to-server `onUploadCompleted` webhook (no session cookie, non-office
  // IP) can reach them — otherwise the IP gate / auth redirect blocks the
  // callback and the browser upload hangs forever. Auth for the token-mint step
  // is enforced inside each route's onBeforeGenerateToken, and Blob verifies the
  // completion callback via the signed token.
  /^\/api\/documents\/upload$/,
  /^\/api\/samples\/upload$/,
  /^\/api\/feasibility\/upload$/,
  /^\/api\/clients\/business-card\/upload$/,
  /^\/manifest\.json$/,
  /^\/sw\.js$/,
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Read the `email` claim from a Firebase session cookie WITHOUT verifying its
 * signature. Edge middleware can't run the Admin SDK, and this value is used
 * ONLY for the non-security-critical IP-bypass decision — the authoritative
 * check (adminAuth.verifySessionCookie) happens server-side in getCurrentEmployee.
 * A forged cookie could at most reach the login page from off-network; it can
 * never authenticate. Fails closed (null) on any parse error.
 */
function emailFromSessionCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  try {
    const payload = cookie.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("__session")?.value;

  // ── IP gate: runs before auth, before everything ──────────────
  const ip = clientIpFromHeaders(req.headers);
  const ipOk = isIpAllowed(ip, process.env.ALLOWED_IPS);

  if (!ipOk) {
    // Protected routes from a non-allowed IP are permitted ONLY for allowlisted
    // bypass emails (owners working off-site); everyone else gets the denial page.
    if (!isPublicRoute(pathname)) {
      const email = emailFromSessionCookie(session);
      const bypass = email ? isBypassEmail(email) : false;
      if (!bypass) {
        if (pathname === "/access-denied") return NextResponse.next();
        const url = req.nextUrl.clone();
        url.pathname = "/access-denied";
        return NextResponse.rewrite(url, { status: 403 });
      }
      // bypass user → fall through to the auth check below
    }
    // public route from a blocked IP → allow through (so they can reach /login)
  } else if (pathname === "/access-denied") {
    // Allowed visitors never see the denial page.
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ── Auth: protected routes require a session cookie ────────────
  // Presence-check only (Edge can't verify); getCurrentEmployee does the
  // authoritative Admin-SDK verification and treats an invalid cookie as
  // signed-out (redirecting to /login), so a bad cookie can't reach data.
  if (!isPublicRoute(pathname) && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
