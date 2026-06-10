import { describe, it, expect } from "vitest";
import { isIpAllowed } from "@/lib/ip-gate";

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
  it("always allows localhost (dev)", () => {
    expect(isIpAllowed("127.0.0.1", "103.5.6.7")).toBe(true);
    expect(isIpAllowed("::1", "103.5.6.7")).toBe(true);
  });
  it("blocks when ip is unknown and a list is set", () => {
    expect(isIpAllowed("", "103.5.6.7")).toBe(false);
  });
});
