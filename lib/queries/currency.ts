import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, currencies, inquiries, invoices } from "@/db/schema";
import type { InvoiceStatus } from "@/db/enums";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { RATE_STALE_DAYS } from "@/lib/validators/currency";

/**
 * The enquiry form's legacy free list (`INQUIRY_CURRENCIES` in db/enums.ts)
 * predates the currency master and spells three codes differently — "EURO" for
 * EUR, "AHD" for the UAE dirham, "Ruble" for RUB. Usage counts fold those
 * spellings into the ISO code so a currency that IS referenced by live records
 * can never be silently deactivated.
 */
const LEGACY_CODE_ALIASES: Record<string, readonly string[]> = {
  EUR: ["EURO"],
  AED: ["AHD"],
  RUB: ["RUBLE", "RUBLES"],
};

/** Every spelling that counts as a reference to `code`, upper-cased. */
function aliasesFor(code: string): string[] {
  const upper = code.toUpperCase();
  return [upper, ...(LEGACY_CODE_ALIASES[upper] ?? [])];
}

export interface CurrencyUsage {
  inquiries: number;
  clients: number;
  total: number;
}

/**
 * Currency codes actually written on business records, normalised to upper-case
 * and counted per source table. Two small grouped scans — the columns are plain
 * `text`, there is no FK to join through.
 */
async function currencyUsageByCode(): Promise<Map<string, CurrencyUsage>> {
  const [inquiryRows, clientRows] = await Promise.all([
    db
      .select({
        code: sql<string>`upper(btrim(${inquiries.currency}))`,
        n: sql<number>`count(*)::int`,
      })
      .from(inquiries)
      .where(isNotNull(inquiries.currency))
      .groupBy(sql`upper(btrim(${inquiries.currency}))`),
    db
      .select({
        code: sql<string>`upper(btrim(${clients.currency}))`,
        n: sql<number>`count(*)::int`,
      })
      .from(clients)
      .where(isNotNull(clients.currency))
      .groupBy(sql`upper(btrim(${clients.currency}))`),
  ]);

  const map = new Map<string, CurrencyUsage>();
  const bump = (code: string, key: "inquiries" | "clients", n: number) => {
    if (!code) return;
    const entry = map.get(code) ?? { inquiries: 0, clients: 0, total: 0 };
    entry[key] += n;
    entry.total += n;
    map.set(code, entry);
  };
  for (const r of inquiryRows) bump(r.code, "inquiries", r.n);
  for (const r of clientRows) bump(r.code, "clients", r.n);
  return map;
}

export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  /** Raw `numeric` string exactly as stored — the edit form round-trips this. */
  exchangeRateRaw: string;
  /** Parsed for display/sorting only. */
  exchangeRate: number;
  rateUpdatedAt: Date | null;
  isBase: boolean;
  isActive: boolean;
  sortOrder: number;
  usage: CurrencyUsage;
  /** Legacy spellings that were folded into this row's usage count. */
  matchedAliases: string[];
  /** Non-base rate never set, or last touched more than RATE_STALE_DAYS ago. */
  isRateStale: boolean;
}

export interface UnmappedCurrencyCode {
  code: string;
  usage: CurrencyUsage;
}

export interface CurrencyMasterView {
  rows: CurrencyRow[];
  /** Codes used by live records that have no row in the currency master. */
  unmapped: UnmappedCurrencyCode[];
  /** The `currencies` row flagged `is_base`, if there is exactly one. */
  baseCode: string | null;
  /** `org_settings.base_currency_code` — should agree with `baseCode`. */
  settingsBaseCode: string;
  /**
   * True when exactly one row is base AND it agrees with org settings AND it is
   * active. False means the Repair action should be offered.
   */
  baseHealthy: boolean;
  activeCount: number;
  staleRateCount: number;
}

/**
 * The whole currency master plus everything the admin page needs to reason
 * about it: per-code usage, base-flag health, stale rates, and any code that
 * appears on live records without a master row. Renders sensibly on a fresh
 * database (no currencies, no inquiries, no clients).
 */
export async function getCurrencyMasterView(): Promise<CurrencyMasterView> {
  const [rows, usage, settings] = await Promise.all([
    db
      .select()
      .from(currencies)
      .orderBy(asc(currencies.sortOrder), asc(currencies.code)),
    currencyUsageByCode(),
    getOrgSettings(),
  ]);

  const staleBefore = Date.now() - RATE_STALE_DAYS * 24 * 60 * 60 * 1000;
  const claimed = new Set<string>();

  const mapped: CurrencyRow[] = rows.map((r) => {
    const aliases = aliasesFor(r.code);
    const merged: CurrencyUsage = { inquiries: 0, clients: 0, total: 0 };
    const matchedAliases: string[] = [];
    for (const alias of aliases) {
      claimed.add(alias);
      const hit = usage.get(alias);
      if (!hit) continue;
      merged.inquiries += hit.inquiries;
      merged.clients += hit.clients;
      merged.total += hit.total;
      if (alias !== r.code.toUpperCase()) matchedAliases.push(alias);
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      symbol: r.symbol,
      exchangeRateRaw: r.exchangeRateToInr,
      exchangeRate: Number(r.exchangeRateToInr),
      rateUpdatedAt: r.rateUpdatedAt,
      isBase: r.isBase,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      usage: merged,
      matchedAliases,
      isRateStale:
        !r.isBase &&
        r.isActive &&
        (r.rateUpdatedAt === null || r.rateUpdatedAt.getTime() < staleBefore),
    };
  });

  const unmapped: UnmappedCurrencyCode[] = [];
  for (const [code, u] of usage) {
    if (claimed.has(code)) continue;
    unmapped.push({ code, usage: u });
  }
  unmapped.sort((a, b) => b.usage.total - a.usage.total || a.code.localeCompare(b.code));

  const baseRows = mapped.filter((r) => r.isBase);
  const baseRow = baseRows.length === 1 ? baseRows[0] : undefined;
  const baseCode = baseRow?.code ?? null;

  return {
    rows: mapped,
    unmapped,
    baseCode,
    settingsBaseCode: settings.baseCurrencyCode,
    baseHealthy:
      baseRow !== undefined &&
      baseRow.isActive &&
      baseRow.code === settings.baseCurrencyCode,
    activeCount: mapped.filter((r) => r.isActive).length,
    staleRateCount: mapped.filter((r) => r.isRateStale).length,
  };
}

/**
 * Usage count for one code (including its legacy spellings). Server actions
 * call this before deactivating so the guard runs against live data, not
 * against whatever the browser claimed.
 */
export async function countCurrencyUsage(code: string): Promise<CurrencyUsage> {
  const aliases = aliasesFor(code);
  const [inquiryRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(inArray(sql`upper(btrim(${inquiries.currency}))`, aliases));
  const [clientRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clients)
    .where(inArray(sql`upper(btrim(${clients.currency}))`, aliases));

  const inquiryCount = inquiryRow?.n ?? 0;
  const clientCount = clientRow?.n ?? 0;
  return {
    inquiries: inquiryCount,
    clients: clientCount,
    total: inquiryCount + clientCount,
  };
}

// ── Credit policy ───────────────────────────────────────────────────────────

export interface CreditPolicy {
  defaultCreditDays: number;
  /** Raw `numeric` string, or null when no org-wide limit is set. */
  defaultCreditLimitRaw: string | null;
  defaultCreditLimit: number | null;
  defaultPaymentTerms: string | null;
  baseCurrencyCode: string;
  updatedAt: Date;
}

export async function getCreditPolicy(): Promise<CreditPolicy> {
  const s = await getOrgSettings();
  return {
    defaultCreditDays: s.defaultCreditDays,
    defaultCreditLimitRaw: s.defaultCreditLimit,
    defaultCreditLimit:
      s.defaultCreditLimit === null ? null : Number(s.defaultCreditLimit),
    defaultPaymentTerms: s.defaultPaymentTerms,
    baseCurrencyCode: s.baseCurrencyCode,
    updatedAt: s.updatedAt,
  };
}

export interface CreditDefaultsGap {
  activeClients: number;
  missingCreditDays: number;
  missingCreditLimit: number;
  missingPaymentTerms: number;
}

/**
 * How many live clients would be touched by a backfill. Counts only active,
 * non-deleted clients — governance is deactivate-only, so soft-deleted rows
 * stay untouched.
 */
export async function getCreditDefaultsGap(): Promise<CreditDefaultsGap> {
  const [row] = await db
    .select({
      activeClients: sql<number>`count(*)::int`,
      missingCreditDays: sql<number>`(count(*) filter (where ${clients.creditDays} is null))::int`,
      missingCreditLimit: sql<number>`(count(*) filter (where ${clients.creditLimit} is null))::int`,
      missingPaymentTerms: sql<number>`(count(*) filter (where ${clients.paymentTerms} is null or btrim(${clients.paymentTerms}) = ''))::int`,
    })
    .from(clients)
    .where(and(eq(clients.isActive, true), isNull(clients.deletedAt)));

  return (
    row ?? {
      activeClients: 0,
      missingCreditDays: 0,
      missingCreditLimit: 0,
      missingPaymentTerms: 0,
    }
  );
}

// ── Credit exposure (read-only, derived) ────────────────────────────────────

/** An invoice counts against credit once it is issued and not fully settled. */
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["issued", "part_paid"];

export interface CreditExposureRow {
  clientId: string;
  clientName: string;
  clientCode: string | null;
  currency: string | null;
  openInvoices: number;
  outstanding: number;
  overdueAmount: number;
  maxDaysPastDue: number;
  effectiveCreditDays: number;
  creditDaysFromClient: boolean;
  effectiveCreditLimit: number | null;
  creditLimitFromClient: boolean;
  overLimitBy: number;
  isOverLimit: boolean;
  isPastTerms: boolean;
}

export interface CreditExposure {
  rows: CreditExposureRow[];
  totalOutstanding: number;
  totalOverdue: number;
  overLimitCount: number;
  pastTermsCount: number;
  /**
   * False when no invoice has ever been issued — the page then says "no billing
   * data yet" instead of implying "everybody is within terms".
   */
  hasInvoiceData: boolean;
}

/**
 * Derived, read-only credit exposure: outstanding = issued invoice grand total
 * minus amount paid; a line is past terms once `invoice_date + credit days` is
 * behind today, where credit days is the client's own value falling back to the
 * org default. Nothing here is stored — it is recomputed on every render.
 */
export async function getCreditExposure(): Promise<CreditExposure> {
  const policy = await getCreditPolicy();
  const defaultDays = policy.defaultCreditDays;

  const outstandingExpr = sql`(coalesce(${invoices.grandTotal}, 0) - coalesce(${invoices.amountPaid}, 0))`;
  const dueExpr = sql`(${invoices.invoiceDate} + (coalesce(${clients.creditDays}, ${defaultDays}::int) * interval '1 day'))`;

  const [issuedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoices)
    .where(isNotNull(invoices.invoiceNo));

  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientCode: clients.clientCode,
      currency: clients.currency,
      creditDays: clients.creditDays,
      creditLimit: clients.creditLimit,
      openInvoices: sql<number>`count(*)::int`,
      outstanding: sql<string>`coalesce(sum(${outstandingExpr}), 0)`,
      overdueAmount: sql<string>`coalesce(sum(case when ${dueExpr} < now() then ${outstandingExpr} else 0 end), 0)`,
      maxDaysPastDue: sql<number>`coalesce(max(case when ${dueExpr} < now() then floor(extract(epoch from (now() - ${dueExpr})) / 86400) else 0 end), 0)::int`,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        inArray(invoices.status, OPEN_INVOICE_STATUSES),
        sql`(coalesce(${invoices.grandTotal}, 0) - coalesce(${invoices.amountPaid}, 0)) > 0`,
      ),
    )
    .groupBy(clients.id);

  const mapped: CreditExposureRow[] = rows.map((r) => {
    const outstanding = Number(r.outstanding);
    const overdueAmount = Number(r.overdueAmount);
    const creditDaysFromClient = r.creditDays !== null;
    const clientLimit = r.creditLimit === null ? null : Number(r.creditLimit);
    const effectiveCreditLimit = clientLimit ?? policy.defaultCreditLimit;
    const overLimitBy =
      effectiveCreditLimit === null
        ? 0
        : Math.max(0, outstanding - effectiveCreditLimit);
    return {
      clientId: r.clientId,
      clientName: r.clientName,
      clientCode: r.clientCode,
      currency: r.currency,
      openInvoices: r.openInvoices,
      outstanding,
      overdueAmount,
      maxDaysPastDue: r.maxDaysPastDue,
      effectiveCreditDays: r.creditDays ?? defaultDays,
      creditDaysFromClient,
      effectiveCreditLimit,
      creditLimitFromClient: clientLimit !== null,
      overLimitBy,
      isOverLimit: overLimitBy > 0,
      isPastTerms: overdueAmount > 0,
    };
  });

  // Worst first: over-limit rupees, then overdue rupees, then plain exposure.
  mapped.sort(
    (a, b) =>
      b.overLimitBy - a.overLimitBy ||
      b.overdueAmount - a.overdueAmount ||
      b.outstanding - a.outstanding ||
      a.clientName.localeCompare(b.clientName),
  );

  return {
    rows: mapped,
    totalOutstanding: mapped.reduce((s, r) => s + r.outstanding, 0),
    totalOverdue: mapped.reduce((s, r) => s + r.overdueAmount, 0),
    overLimitCount: mapped.filter((r) => r.isOverLimit).length,
    pastTermsCount: mapped.filter((r) => r.isPastTerms).length,
    hasInvoiceData: (issuedRow?.n ?? 0) > 0,
  };
}
