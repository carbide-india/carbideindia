/**
 * IP allowlist gate.
 *
 * TRUST PRECONDITION: the client IP is read from `x-forwarded-for` (first
 * hop). This is ONLY trustworthy behind a proxy that overwrites the header —
 * Vercel does. On a bare `next start` deployment a client can spoof
 * X-Forwarded-For, and behind a misconfigured reverse proxy all traffic may
 * appear as 127.0.0.1. If deploying outside Vercel, configure the proxy to
 * set X-Forwarded-For to the real client address (e.g. nginx
 * `proxy_set_header X-Forwarded-For $remote_addr`).
 */

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Pure allowlist check. Empty/unset list = gate disabled (every IP passes).
 * Localhost bypass applies only outside production (`opts.nodeEnv`),
 * so a misconfigured proxy that reports 127.0.0.1 fails closed in prod.
 */
export function isIpAllowed(
  ip: string,
  allowedList: string | undefined,
  opts: { nodeEnv?: string } = { nodeEnv: process.env.NODE_ENV },
): boolean {
  const allowed = (allowedList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  if (opts.nodeEnv !== "production" && LOCALHOST.has(ip)) return true;
  return allowed.includes(ip);
}

/** First hop of x-forwarded-for is the client IP on Vercel (see module docblock). */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? "").trim();
  return headers.get("x-real-ip") ?? "";
}
