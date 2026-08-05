/**
 * IP / CIDR parsing + matching for admin → Access Control.
 *
 * Pure, dependency-free and framework-free so it runs identically in a server
 * action, in a query module and under vitest.  `lib/ip-gate.ts` stays the
 * middleware-side gate (exact string match against the ALLOWED_IPS env var);
 * this module is the richer DB-backed register that understands CIDR blocks,
 * canonicalises what an admin types, and can answer "does the caller's address
 * fall inside this entry?".
 *
 * IPv4-mapped IPv6 (`::ffff:203.0.113.7`) is folded down to its IPv4 form so a
 * request that arrives dual-stacked still matches a plain IPv4 allowlist entry.
 */

export type IpVersion = 4 | 6;

export interface ParsedIp {
  version: IpVersion;
  /** Big-endian address bytes: 4 for IPv4, 16 for IPv6. */
  bytes: number[];
}

export interface ParsedCidr extends ParsedIp {
  /** Prefix length in bits (32 / 128 when the admin typed a bare address). */
  prefix: number;
  /** Canonical storage form — bare address when the prefix is full-width. */
  normalized: string;
  /** True when the admin typed host bits that canonicalisation zeroed out. */
  hostBitsCleared: boolean;
}

const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

/** Strict dotted-quad parse. Rejects leading zeros ("01") and out-of-range octets. */
function parseIpv4(input: string): [number, number, number, number] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!IPV4_OCTET.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  const [a, b, c, d] = out;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

/** RFC 4291 textual IPv6, including "::" compression and a trailing IPv4 tail. */
function parseIpv6(input: string): number[] | null {
  let str = input;

  // "::ffff:203.0.113.7" — rewrite the dotted tail as two hex groups so the
  // group walker below only ever sees hex.
  const lastColon = str.lastIndexOf(":");
  if (lastColon === -1) return null;
  const tail = str.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    str = `${str.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = str.split("::");
  if (halves.length > 2) return null;
  const headRaw = halves[0] ?? "";
  const tailRaw = halves.length === 2 ? (halves[1] ?? "") : null;

  const head = headRaw === "" ? [] : headRaw.split(":");
  const rest = tailRaw === null || tailRaw === "" ? [] : tailRaw.split(":");

  let groups: string[];
  if (tailRaw === null) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const fill = 8 - head.length - rest.length;
    // "::" must stand for at least one zero group, otherwise it is a
    // mis-typed full address rather than a compressed one.
    if (fill < 1) return null;
    groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  }

  const bytes: number[] = [];
  for (const g of groups) {
    if (!IPV6_GROUP.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

/** True when a 16-byte IPv6 address is the ::ffff:0:0/96 mapping of an IPv4 one. */
function isV4Mapped(bytes: number[]): boolean {
  if (bytes.length !== 16) return false;
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return false;
  return bytes[10] === 0xff && bytes[11] === 0xff;
}

/**
 * Parse a bare address (no prefix). Returns null for anything unparseable —
 * callers treat null as "no match", never as "match everything".
 */
export function parseIp(input: string): ParsedIp | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (raw.includes(":")) {
    const bytes = parseIpv6(raw);
    if (!bytes) return null;
    // Fold ::ffff:a.b.c.d down to plain IPv4 so it matches IPv4 entries.
    if (isV4Mapped(bytes)) return { version: 4, bytes: bytes.slice(12) };
    return { version: 6, bytes };
  }
  const v4 = parseIpv4(raw);
  return v4 ? { version: 4, bytes: [...v4] } : null;
}

/** Zero every bit below `prefix` — turns "203.0.113.7/24" into "203.0.113.0/24". */
function maskBytes(bytes: number[], prefix: number): number[] {
  return bytes.map((b, i) => {
    const bitsBefore = i * 8;
    if (prefix >= bitsBefore + 8) return b;
    if (prefix <= bitsBefore) return 0;
    const keep = prefix - bitsBefore;
    return b & (0xff << (8 - keep)) & 0xff;
  });
}

/** Render bytes back to text (IPv4 dotted quad, IPv6 lower-case ":"-compressed). */
function formatBytes(bytes: number[], version: IpVersion): string {
  if (version === 4) return bytes.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16));
  }
  // Compress the longest run of zero groups (>= 2) per RFC 5952.
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === "0") {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const len = i - runStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  if (bestLen < 2) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

/**
 * Parse "203.0.113.7", "203.0.113.0/24" or "2001:db8::/32" into a canonical
 * network. Host bits are zeroed and reported via `hostBitsCleared` so the UI can
 * tell the admin what was actually stored.
 */
export function parseCidr(input: string): ParsedCidr | null {
  const raw = input.trim();
  if (raw === "") return null;

  const slash = raw.indexOf("/");
  const addrPart = slash === -1 ? raw : raw.slice(0, slash);
  const prefixPart = slash === -1 ? null : raw.slice(slash + 1);

  const addr = parseIp(addrPart);
  if (!addr) return null;

  const width = addr.version === 4 ? 32 : 128;
  let prefix = width;
  if (prefixPart !== null) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > width) return null;
    // A v4-mapped v6 literal written with a /128-style prefix is ambiguous;
    // reject rather than guess.
    if (addr.version === 4 && addrPart.includes(":")) return null;
  }

  const masked = maskBytes(addr.bytes, prefix);
  const hostBitsCleared = masked.some((b, i) => b !== addr.bytes[i]);
  const text = formatBytes(masked, addr.version);
  const normalized = prefix === width ? text : `${text}/${prefix}`;

  return { version: addr.version, bytes: masked, prefix, normalized, hostBitsCleared };
}

/** Convenience: canonical storage string, or null when the input is invalid. */
export function normalizeCidr(input: string): string | null {
  return parseCidr(input)?.normalized ?? null;
}

/** True when `ip` falls inside the network `cidr`. Unparseable input never matches. */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const target = parseIp(ip);
  const net = parseCidr(cidr);
  if (!target || !net) return false;
  if (target.version !== net.version) return false;

  const full = net.prefix >> 3;
  for (let i = 0; i < full; i++) {
    if (target.bytes[i] !== net.bytes[i]) return false;
  }
  const remainder = net.prefix & 7;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return ((target.bytes[full] ?? 0) & mask) === ((net.bytes[full] ?? 0) & mask);
}

/** First CIDR in `cidrs` that contains `ip`, or null. Order is caller-defined. */
export function firstMatchingCidr(ip: string, cidrs: string[]): string | null {
  for (const c of cidrs) {
    if (ipMatchesCidr(ip, c)) return c;
  }
  return null;
}

/**
 * Split the ALLOWED_IPS env var the way middleware.ts does: comma-separated,
 * trimmed, empties dropped. Kept here (rather than imported) so the admin page
 * shows exactly what the gate sees even if that file's parsing changes shape.
 */
export function parseAllowedIpsEnv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lower-cased, de-duplicated, order-preserving email list. */
export function normalizeEmailList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const e = v.trim().toLowerCase();
    if (e === "" || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Human label for a prefix: "single address", "256 addresses", … */
export function describeCidr(input: string): string {
  const parsed = parseCidr(input);
  if (!parsed) return "invalid";
  const width = parsed.version === 4 ? 32 : 128;
  if (parsed.prefix === width) return "single address";
  const hostBits = width - parsed.prefix;
  if (hostBits >= 24) return `IPv${parsed.version} block · /${parsed.prefix}`;
  return `${2 ** hostBits} addresses · /${parsed.prefix}`;
}
