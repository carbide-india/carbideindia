const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Pure allowlist check. Empty/unset list = gate disabled (every IP passes). */
export function isIpAllowed(ip: string, allowedList: string | undefined): boolean {
  const allowed = (allowedList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  if (LOCALHOST.has(ip)) return true;
  return allowed.includes(ip);
}

/** First hop of x-forwarded-for is the client IP on Vercel. */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? "").trim();
  return headers.get("x-real-ip") ?? "";
}
