import { describe, expect, it } from "vitest";
import {
  isLiveSession,
  parseUserAgent,
  sessionState,
} from "@/lib/sessions/user-agent";
import { sessionAge } from "@/lib/sessions/format";

describe("parseUserAgent", () => {
  it("returns all-null for missing or blank input", () => {
    for (const input of [null, undefined, "", "   "]) {
      const p = parseUserAgent(input);
      expect(p.browser).toBeNull();
      expect(p.os).toBeNull();
      expect(p.label).toBeNull();
      expect(p.kind).toBe("unknown");
    }
  });

  it("identifies Chrome on Windows", () => {
    const p = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    );
    expect(p.browser).toBe("Chrome");
    expect(p.os).toBe("Windows");
    expect(p.kind).toBe("desktop");
    expect(p.label).toBe("Chrome on Windows");
  });

  it("does not mistake Edge or Opera for Chrome", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
      ).browser,
    ).toBe("Edge");
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0",
      ).browser,
    ).toBe("Opera");
  });

  it("identifies Safari on iOS as a mobile device", () => {
    const p = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    );
    expect(p.browser).toBe("Safari");
    expect(p.os).toBe("iOS");
    expect(p.kind).toBe("mobile");
  });

  it("treats a non-Mobile Android UA as a tablet", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      ).kind,
    ).toBe("tablet");
  });

  it("falls back to whichever half it recognised", () => {
    expect(parseUserAgent("curl/8.5.0").label).toBeNull();
    expect(
      parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)").label,
    ).toBe("Windows");
  });
});

describe("sessionState", () => {
  const policy = { idleTimeoutMinutes: 10, sessionMaxHours: 12 };
  const now = new Date("2026-08-04T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("reports revoked regardless of activity", () => {
    expect(
      sessionState({ lastSeenAt: now, revokedAt: ago(1000) }, policy, now),
    ).toBe("revoked");
  });

  it("reports online inside the idle window", () => {
    expect(
      sessionState({ lastSeenAt: ago(9 * 60_000), revokedAt: null }, policy, now),
    ).toBe("online");
  });

  it("reports idle past the idle window but inside the max lifetime", () => {
    expect(
      sessionState({ lastSeenAt: ago(60 * 60_000), revokedAt: null }, policy, now),
    ).toBe("idle");
  });

  it("reports expired past the max lifetime", () => {
    expect(
      sessionState(
        { lastSeenAt: ago(13 * 3_600_000), revokedAt: null },
        policy,
        now,
      ),
    ).toBe("expired");
  });

  it("only counts online and idle as live", () => {
    expect(isLiveSession("online")).toBe(true);
    expect(isLiveSession("idle")).toBe(true);
    expect(isLiveSession("expired")).toBe(false);
    expect(isLiveSession("revoked")).toBe(false);
  });
});

describe("sessionAge", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("collapses sub-minute and future timestamps to 'just now'", () => {
    expect(sessionAge(ago(20_000), now)).toBe("just now");
    expect(sessionAge(new Date(now.getTime() + 5_000), now)).toBe("just now");
  });

  it("steps through minutes, hours, days, months and years", () => {
    expect(sessionAge(ago(12 * 60_000), now)).toBe("12 min ago");
    expect(sessionAge(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(sessionAge(ago(6 * 86_400_000), now)).toBe("6 d ago");
    expect(sessionAge(ago(60 * 86_400_000), now)).toBe("2 mo ago");
    expect(sessionAge(ago(400 * 86_400_000), now)).toBe("1 y ago");
  });
});
