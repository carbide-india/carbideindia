/**
 * User-agent parsing for /admin/sessions.
 *
 * Deliberately tiny and dependency-free: we only need enough to render a
 * recognisable device label ("Chrome on Windows") next to a session row.  It
 * never guesses - anything it cannot identify comes back as null so the UI can
 * print the raw string instead of inventing a device.
 */

export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";

export interface ParsedUserAgent {
  /** Browser name, or null when the UA doesn't identify one. */
  browser: string | null;
  /** Operating system name, or null when the UA doesn't identify one. */
  os: string | null;
  kind: DeviceKind;
  /** "Chrome on Windows" / "Safari" / null when nothing was recognised. */
  label: string | null;
}

const EMPTY: ParsedUserAgent = {
  browser: null,
  os: null,
  kind: "unknown",
  label: null,
};

// Order matters: Edge/Opera/Samsung all claim "Chrome", Chrome claims "Safari".
const BROWSERS: [RegExp, string][] = [
  [/\bEdgA?\/|\bEdge\//i, "Edge"],
  [/\bOPR\/|\bOpera\//i, "Opera"],
  [/\bSamsungBrowser\//i, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//i, "Firefox"],
  [/\bCriOS\//i, "Chrome"],
  [/\bChrome\//i, "Chrome"],
  [/\bSafari\//i, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/\bWindows NT\b/i, "Windows"],
  [/\bAndroid\b/i, "Android"],
  [/\b(iPhone|iPod)\b/i, "iOS"],
  [/\biPad\b/i, "iPadOS"],
  [/\bMac OS X\b|\bMacintosh\b/i, "macOS"],
  [/\bCrOS\b/i, "ChromeOS"],
  [/\bLinux\b/i, "Linux"],
];

function detectKind(ua: string): DeviceKind {
  if (/\biPad\b/i.test(ua) || (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua))) {
    return "tablet";
  }
  if (/\bMobi|\biPhone\b|\biPod\b|\bAndroid\b|\bWindows Phone\b/i.test(ua)) {
    return "mobile";
  }
  if (/\bWindows NT\b|\bMacintosh\b|\bCrOS\b|\bX11\b|\bLinux\b/i.test(ua)) {
    return "desktop";
  }
  return "unknown";
}

/** Parse a raw user-agent header. Null/blank input yields an all-null result. */
export function parseUserAgent(raw: string | null | undefined): ParsedUserAgent {
  if (typeof raw !== "string") return EMPTY;
  const ua = raw.trim();
  if (ua.length === 0) return EMPTY;

  let browser: string | null = null;
  for (const [re, name] of BROWSERS) {
    if (re.test(ua)) {
      browser = name;
      break;
    }
  }

  let os: string | null = null;
  for (const [re, name] of OSES) {
    if (re.test(ua)) {
      os = name;
      break;
    }
  }

  const label =
    browser && os ? `${browser} on ${os}` : (browser ?? os ?? null);

  return { browser, os, kind: detectKind(ua), label };
}

/**
 * How a session row should read in the "state" column. Pure so the same rule is
 * used by the server (KPI counts) and the client (row pills) without drift.
 *
 *  - `revoked`  an admin killed the row (terminal, regardless of activity)
 *  - `online`   seen within the org's idle-timeout window
 *  - `idle`     still inside the max session lifetime but past the idle window
 *  - `expired`  older than the max session lifetime - nothing to revoke
 */
export type SessionState = "revoked" | "online" | "idle" | "expired";

export function sessionState(
  row: { lastSeenAt: Date; revokedAt: Date | null },
  policy: { idleTimeoutMinutes: number; sessionMaxHours: number },
  now: Date = new Date(),
): SessionState {
  if (row.revokedAt !== null) return "revoked";
  const ageMs = now.getTime() - row.lastSeenAt.getTime();
  if (ageMs <= policy.idleTimeoutMinutes * 60_000) return "online";
  if (ageMs <= policy.sessionMaxHours * 3_600_000) return "idle";
  return "expired";
}

/** True when a session row is still worth revoking (not revoked, not expired). */
export function isLiveSession(state: SessionState): boolean {
  return state === "online" || state === "idle";
}
