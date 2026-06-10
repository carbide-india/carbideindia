import { describe, it, expect } from "vitest";
import { clientIpFromHeaders, isIpAllowed } from "@/lib/ip-gate";

describe("isIpAllowed", () => {
  it("allows any ip when the allowlist is empty (gate disabled)", () => {
    expect(isIpAllowed("203.0.113.7", "")).toBe(true);
    expect(isIpAllowed("203.0.113.7", undefined)).toBe(true);
  });
  it("allows listed ips and trims whitespace", () => {
    expect(isIpAllowed("103.5.6.7", " 103.5.6.7 , 49.8.9.10")).toBe(true);
    expect(isIpAllowed("49.8.9.10", "103.5.6.7,49.8.9.10")).toBe(true);
  });
  it("blocks unlisted ips", () => {
    expect(isIpAllowed("8.8.8.8", "103.5.6.7,49.8.9.10")).toBe(false);
  });
  it("allows localhost outside production (dev/test)", () => {
    expect(isIpAllowed("127.0.0.1", "103.5.6.7", { nodeEnv: "development" })).toBe(true);
    expect(isIpAllowed("::1", "103.5.6.7", { nodeEnv: "development" })).toBe(true);
    expect(isIpAllowed("::ffff:127.0.0.1", "103.5.6.7", { nodeEnv: "test" })).toBe(true);
    // default opts read process.env.NODE_ENV, which is "test" under vitest
    expect(isIpAllowed("127.0.0.1", "103.5.6.7")).toBe(true);
  });
  it("does NOT bypass localhost in production (fail closed behind a bad proxy)", () => {
    expect(isIpAllowed("127.0.0.1", "103.5.6.7", { nodeEnv: "production" })).toBe(false);
    expect(isIpAllowed("::1", "103.5.6.7", { nodeEnv: "production" })).toBe(false);
    expect(isIpAllowed("::ffff:127.0.0.1", "103.5.6.7", { nodeEnv: "production" })).toBe(false);
  });
  it("still allows a localhost ip in production when explicitly listed", () => {
    expect(isIpAllowed("127.0.0.1", "127.0.0.1,103.5.6.7", { nodeEnv: "production" })).toBe(true);
  });
  it("blocks when ip is unknown and a list is set", () => {
    expect(isIpAllowed("", "103.5.6.7")).toBe(false);
    expect(isIpAllowed("", "103.5.6.7", { nodeEnv: "production" })).toBe(false);
  });
});

describe("clientIpFromHeaders", () => {
  it("returns the first hop of a multi-hop x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });
  it("returns a single x-forwarded-for value trimmed", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.7 " });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.4" });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.4");
  });
  it("prefers x-forwarded-for over x-real-ip", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.4",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });
  it("returns empty string with no headers — and that ip is blocked when a list is set (fail closed)", () => {
    const ip = clientIpFromHeaders(new Headers());
    expect(ip).toBe("");
    expect(isIpAllowed(ip, "103.5.6.7", { nodeEnv: "production" })).toBe(false);
  });
});
