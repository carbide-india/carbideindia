import "server-only";
import { toAddressStateName } from "@/lib/data/geo";

/**
 * GSTIN → business details lookup. A GSTIN returns rich, standardised data (the
 * GSTN "Search Taxpayer" schema), so one call auto-fills the company name,
 * registered address, taxpayer type and GSTIN status.
 *
 * Two paths:
 *   1. Sandbox (sandbox.co.in) - a first-class adapter. Sandbox uses a 2-step
 *      auth: POST /authenticate with x-api-key + x-api-secret → a 24h JWT, then
 *      POST /gst/compliance/public/gstin/search with that token. Enable with
 *      SANDBOX_API_KEY + SANDBOX_API_SECRET (optionally KYB_PROVIDER=sandbox).
 *   2. Generic - any other provider, driven purely by KYB_* env (single-key
 *      auth). Reads the GSTN-standard fields from KYB_GST_DATA_PATH.
 *
 * No free official API exists; a provider key is required. When unconfigured,
 * callers get a clear notConfigured result and the form stays manual. Secrets
 * live only in env (.env.local / Vercel) - never in code.
 */

export interface GstAddress {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface GstDetails {
  ok: boolean;
  error?: string;
  notConfigured?: boolean;
  legalName?: string;
  tradeName?: string;
  constitution?: string;
  taxpayerType?: string;
  registrationType?: string;
  status?: string;
  registrationDate?: string;
  address?: GstAddress;
}

function readObj(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function fill(template: string, gstin: string, encode: boolean): string {
  return template.replaceAll("{gstin}", encode ? encodeURIComponent(gstin) : gstin);
}

/** GSTN taxpayer-type (dty) → our GST_REGISTRATION_TYPES enum value. */
function toRegistrationType(dty: string | undefined): string | undefined {
  if (!dty) return undefined;
  const d = dty.toLowerCase();
  if (d.includes("composition")) return "composition";
  if (d.includes("sez")) return "sez";
  if (d.includes("unregist")) return "unregistered";
  return "regular";
}

/** Map the GSTN principal-address object (pradr.addr) to the form's fields. */
function toAddress(addr: Record<string, unknown> | undefined): GstAddress | undefined {
  if (!addr) return undefined;
  const line1 = [str(addr.flno), str(addr.bno), str(addr.bnm)].filter(Boolean).join(", ");
  const stateRaw = str(addr.stcd);
  return {
    line1: line1 || undefined,
    line2: str(addr.st),
    line3: str(addr.loc),
    line4: str(addr.landMark),
    city: str(addr.city) ?? str(addr.dst),
    state: stateRaw ? toAddressStateName(stateRaw) : undefined,
    pincode: str(addr.pncd),
  };
}

/** A GSTN "Search Taxpayer" object (lgnm/tradeNam/pradr/…) → GstDetails. */
function mapTaxpayer(d: Record<string, unknown>): GstDetails {
  const pradr = readObj(d, "pradr.addr") as Record<string, unknown> | undefined;
  const dty = str(d.dty);
  const details: GstDetails = {
    ok: true,
    legalName: str(d.lgnm),
    tradeName: str(d.tradeNam),
    constitution: str(d.ctb),
    taxpayerType: dty,
    registrationType: toRegistrationType(dty),
    status: str(d.sts),
    registrationDate: str(d.rgdt),
    address: toAddress(pradr),
  };
  if (!details.legalName && !details.tradeName && !details.address) {
    return { ok: false, error: "No details found for this GSTIN." };
  }
  return details;
}

function timedFetch(url: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal, cache: "no-store" }).finally(() =>
    clearTimeout(timeout),
  );
}

// ── Sandbox (sandbox.co.in) adapter ─────────────────────────────────────────
// The 24h JWT is cached in-memory per warm instance to avoid re-authenticating
// on every lookup. Keyed by api key so a rotated credential invalidates it.
let sandboxToken: { key: string; token: string; exp: number } | null = null;

async function getSandboxToken(
  base: string,
  key: string,
  secret: string,
  version: string,
): Promise<string | null> {
  if (sandboxToken && sandboxToken.key === key && sandboxToken.exp > Date.now() + 60_000) {
    return sandboxToken.token;
  }
  const res = await timedFetch(`${base}/authenticate`, {
    method: "POST",
    headers: { "x-api-key": key, "x-api-secret": secret, "x-api-version": version },
  });
  if (!res.ok) return null;
  const json: unknown = await res.json().catch(() => null);
  const token = str(readObj(json, "data.access_token")) ?? str(readObj(json, "access_token"));
  if (!token) return null;
  sandboxToken = { key, token, exp: Date.now() + 23 * 60 * 60 * 1000 };
  return token;
}

async function sandboxLookup(gstin: string): Promise<GstDetails> {
  const key = process.env.SANDBOX_API_KEY?.trim();
  const secret = process.env.SANDBOX_API_SECRET?.trim();
  if (!key || !secret) {
    return {
      ok: false,
      notConfigured: true,
      error: "Set SANDBOX_API_KEY and SANDBOX_API_SECRET in your environment.",
    };
  }
  const base = process.env.SANDBOX_BASE_URL?.trim() || "https://api.sandbox.co.in";
  const version = process.env.SANDBOX_API_VERSION?.trim() || "1.0";
  try {
    const token = await getSandboxToken(base, key, secret, version);
    if (!token) return { ok: false, error: "Sandbox authentication failed - check the key / secret." };
    const res = await timedFetch(`${base}/gst/compliance/public/gstin/search`, {
      method: "POST",
      headers: {
        authorization: token,
        "x-api-key": key,
        "x-api-version": "1.0.0",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ gstin }),
    });
    if (res.status === 422) return { ok: false, error: "Invalid GSTIN." };
    if (res.status === 401 || res.status === 403) {
      sandboxToken = null; // token likely expired/invalid - force re-auth next time
      return { ok: false, error: "Sandbox rejected the request - re-check the key / secret." };
    }
    if (!res.ok) return { ok: false, error: `Provider returned ${res.status}.` };
    const json: unknown = await res.json().catch(() => null);
    const d = readObj(json, "data.data");
    if (d == null || typeof d !== "object") {
      return { ok: false, error: "No details found for this GSTIN." };
    }
    return mapTaxpayer(d as Record<string, unknown>);
  } catch {
    return { ok: false, error: "GST lookup failed - check the Sandbox key / secret and network." };
  }
}

// ── Generic single-key adapter (any other provider) ─────────────────────────
async function genericLookup(gstin: string): Promise<GstDetails> {
  const apiKey = process.env.KYB_API_KEY?.trim();
  const url = process.env.KYB_GST_URL?.trim();
  if (!url || !apiKey) {
    return {
      ok: false,
      notConfigured: true,
      error: "GST lookup isn't configured. Set KYB_GST_URL and KYB_API_KEY (see lib/kyb/gst-lookup.ts).",
    };
  }
  const method = (process.env.KYB_METHOD ?? "POST").toUpperCase();
  const authHeader = process.env.KYB_AUTH_HEADER ?? "Authorization";
  const authScheme = process.env.KYB_AUTH_SCHEME ?? "Bearer ";
  const bodyTemplate = process.env.KYB_GST_BODY ?? '{"id_number":"{gstin}"}';
  const dataPath = process.env.KYB_GST_DATA_PATH ?? "data";
  try {
    const res = await timedFetch(fill(url, gstin, true), {
      method,
      headers: {
        [authHeader]: `${authScheme}${apiKey}`,
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? fill(bodyTemplate, gstin, false) : undefined,
    });
    if (!res.ok) return { ok: false, error: `Provider returned ${res.status}.` };
    const json: unknown = await res.json().catch(() => null);
    const d = readObj(json, dataPath);
    if (d == null || typeof d !== "object") {
      return { ok: false, error: "No details found for this GSTIN." };
    }
    return mapTaxpayer(d as Record<string, unknown>);
  } catch {
    return { ok: false, error: "GST lookup failed - check the provider, key and endpoint." };
  }
}

export async function fetchGstDetails(gstinRaw: string): Promise<GstDetails> {
  const gstin = gstinRaw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (gstin.length !== 15) return { ok: false, error: "Enter a complete 15-character GSTIN first." };

  const provider = process.env.KYB_PROVIDER?.toLowerCase();
  if (provider === "sandbox" || process.env.SANDBOX_API_KEY) {
    return sandboxLookup(gstin);
  }
  return genericLookup(gstin);
}
