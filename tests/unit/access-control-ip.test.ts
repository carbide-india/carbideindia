import { describe, it, expect } from "vitest";
import {
  describeCidr,
  firstMatchingCidr,
  ipMatchesCidr,
  normalizeCidr,
  normalizeEmailList,
  parseAllowedIpsEnv,
  parseCidr,
  parseIp,
} from "@/lib/access-control-ip";

describe("parseIp", () => {
  it("parses dotted-quad IPv4", () => {
    expect(parseIp("203.0.113.7")).toEqual({ version: 4, bytes: [203, 0, 113, 7] });
  });
  it("rejects out-of-range and leading-zero octets", () => {
    expect(parseIp("203.0.113.256")).toBeNull();
    expect(parseIp("203.0.113.07")).toBeNull();
    expect(parseIp("203.0.113")).toBeNull();
    expect(parseIp("")).toBeNull();
  });
  it("parses compressed IPv6", () => {
    const p = parseIp("2001:db8::1");
    expect(p?.version).toBe(6);
    expect(p?.bytes.slice(0, 4)).toEqual([0x20, 0x01, 0x0d, 0xb8]);
    expect(p?.bytes[15]).toBe(1);
  });
  it("folds IPv4-mapped IPv6 down to IPv4", () => {
    expect(parseIp("::ffff:203.0.113.7")).toEqual({
      version: 4,
      bytes: [203, 0, 113, 7],
    });
  });
  it("rejects malformed IPv6", () => {
    expect(parseIp("2001:db8::1::2")).toBeNull();
    expect(parseIp("2001:db8:zzzz::1")).toBeNull();
    expect(parseIp("2001:db8:1:2:3:4:5")).toBeNull();
  });
});

describe("parseCidr / normalizeCidr", () => {
  it("keeps a bare address bare", () => {
    expect(normalizeCidr("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeCidr(" 203.0.113.7/32 ")).toBe("203.0.113.7");
  });
  it("zeroes host bits and reports it", () => {
    const p = parseCidr("203.0.113.7/24");
    expect(p?.normalized).toBe("203.0.113.0/24");
    expect(p?.hostBitsCleared).toBe(true);
  });
  it("leaves an already-canonical block alone", () => {
    const p = parseCidr("10.0.0.0/8");
    expect(p?.normalized).toBe("10.0.0.0/8");
    expect(p?.hostBitsCleared).toBe(false);
  });
  it("compresses IPv6 networks", () => {
    expect(normalizeCidr("2001:0db8:0000:0000:0000:0000:0000:0000/32")).toBe(
      "2001:db8::/32",
    );
  });
  it("rejects impossible prefixes", () => {
    expect(parseCidr("203.0.113.0/33")).toBeNull();
    expect(parseCidr("2001:db8::/129")).toBeNull();
    expect(parseCidr("not-an-ip")).toBeNull();
    expect(parseCidr("")).toBeNull();
  });
});

describe("ipMatchesCidr", () => {
  it("matches a bare address exactly", () => {
    expect(ipMatchesCidr("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(ipMatchesCidr("203.0.113.8", "203.0.113.7")).toBe(false);
  });
  it("matches inside a byte-aligned block", () => {
    expect(ipMatchesCidr("203.0.113.200", "203.0.113.0/24")).toBe(true);
    expect(ipMatchesCidr("203.0.114.1", "203.0.113.0/24")).toBe(false);
  });
  it("handles non-byte-aligned prefixes", () => {
    expect(ipMatchesCidr("203.0.113.10", "203.0.113.0/28")).toBe(true);
    expect(ipMatchesCidr("203.0.113.20", "203.0.113.0/28")).toBe(false);
    expect(ipMatchesCidr("10.1.2.3", "10.0.0.0/9")).toBe(true);
    expect(ipMatchesCidr("10.128.2.3", "10.0.0.0/9")).toBe(false);
  });
  it("matches /0 for every address of the same family", () => {
    expect(ipMatchesCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });
  it("never crosses address families", () => {
    expect(ipMatchesCidr("2001:db8::1", "0.0.0.0/0")).toBe(false);
    expect(ipMatchesCidr("203.0.113.7", "2001:db8::/32")).toBe(false);
  });
  it("matches an IPv4-mapped caller against an IPv4 entry", () => {
    expect(ipMatchesCidr("::ffff:203.0.113.7", "203.0.113.0/24")).toBe(true);
  });
  it("matches inside an IPv6 block", () => {
    expect(ipMatchesCidr("2001:db8:1::5", "2001:db8::/32")).toBe(true);
    expect(ipMatchesCidr("2001:db9::5", "2001:db8::/32")).toBe(false);
  });
  it("treats garbage as no-match, never as match-all", () => {
    expect(ipMatchesCidr("", "203.0.113.0/24")).toBe(false);
    expect(ipMatchesCidr("203.0.113.7", "garbage")).toBe(false);
  });
});

describe("firstMatchingCidr", () => {
  it("returns the first covering entry or null", () => {
    const list = ["198.51.100.0/24", "203.0.113.0/24"];
    expect(firstMatchingCidr("203.0.113.9", list)).toBe("203.0.113.0/24");
    expect(firstMatchingCidr("8.8.8.8", list)).toBeNull();
    expect(firstMatchingCidr("203.0.113.9", [])).toBeNull();
  });
});

describe("parseAllowedIpsEnv", () => {
  it("splits, trims and drops empties", () => {
    expect(parseAllowedIpsEnv(" 1.2.3.4 , 5.6.7.8 ,, ")).toEqual([
      "1.2.3.4",
      "5.6.7.8",
    ]);
    expect(parseAllowedIpsEnv(undefined)).toEqual([]);
    expect(parseAllowedIpsEnv("")).toEqual([]);
  });
});

describe("normalizeEmailList", () => {
  it("lowercases, trims and de-duplicates while keeping order", () => {
    expect(
      normalizeEmailList([" Altus@CarbideIndia.com ", "alok@carbideindia.com", "ALTUS@carbideindia.com", ""]),
    ).toEqual(["altus@carbideindia.com", "alok@carbideindia.com"]);
  });
});

describe("describeCidr", () => {
  it("describes single addresses and blocks", () => {
    expect(describeCidr("203.0.113.7")).toBe("single address");
    expect(describeCidr("203.0.113.0/24")).toBe("256 addresses · /24");
    expect(describeCidr("10.0.0.0/8")).toBe("IPv4 block · /8");
    expect(describeCidr("nonsense")).toBe("invalid");
  });
});
