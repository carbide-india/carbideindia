/**
 * Canonical public base URL of this deployment, used for email links,
 * invite redirect URLs, web-push deep links, etc.
 *
 * Hardened against the most common misconfiguration: `NEXT_PUBLIC_SITE_URL`
 * set WITHOUT a scheme (e.g. `wms.example.com`). Auth providers reject a
 * scheme-less redirect URL, which silently breaks employee invites. We
 * auto-prepend `https://` and validate the result, falling back to the prod
 * host if it's unusable so a bad env var degrades gracefully instead of
 * bricking the invite flow.
 *
 * Returns a URL with no trailing slash.
 */
const FALLBACK = "https://wms.carbideindia.com";

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const cleaned = withScheme.replace(/\/+$/, "");

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return FALLBACK;
    }
    if (!parsed.hostname) return FALLBACK;
  } catch {
    return FALLBACK;
  }

  return cleaned;
}
