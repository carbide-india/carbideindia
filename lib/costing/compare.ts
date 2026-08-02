/**
 * Pure, side-effect-free BO (bought-out) vendor-comparison engine.
 *
 * A bought-out costing may carry up to 5 competing vendor quotes. The server
 * ranks them on three axes and picks the recommended (cheapest) vendor. These
 * functions never touch the DB — they are fully unit-testable and are the single
 * source of truth for the landed-cost formula (mirrored nowhere else).
 *
 * CONFIRMED FORMULA (per piece):
 *   landed = unitPrice + unitPrice*vendorOhPct + developmentCost + (freightCost / qty)
 *
 * freightCost is quoted per ORDER, so it is amortised across `qty` pieces.
 * Missing OH / development / freight are treated as 0. qty must be > 0 for the
 * freight term to apply (guarded — qty<=0 drops freight/pc to 0).
 */

/** A number that may arrive as a JS number, a numeric string (DB `numeric`), or null. */
type MaybeNum = number | string | null | undefined;

/** Coerce a possibly-string/null numeric field to a finite number, else 0. */
function num(v: MaybeNum): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** True when the field holds a real, finite numeric value (not null/blank/NaN). */
function hasNum(v: MaybeNum): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v));
  return false;
}

/** True when an integer-day field holds a real finite value (ignores null). */
function hasInt(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** The shape `vendorLandedCost` / `compareVendors` need — a subset of a vendor quote. */
export interface VendorQuoteLike {
  id?: string;
  unitPrice?: MaybeNum;
  vendorOhPct?: MaybeNum;
  developmentCost?: MaybeNum;
  freightCost?: MaybeNum;
  leadTimeDays?: number | null;
  creditPeriodDays?: number | null;
}

/**
 * Per-vendor landed cost PER PIECE. Guards qty>0 before amortising freight;
 * missing OH/development/freight fold in as 0. A missing unitPrice contributes 0
 * (such rows are excluded from the cheapest ranking by `compareVendors`).
 */
export function vendorLandedCost(quote: VendorQuoteLike, qty: number): number {
  const unitPrice = num(quote.unitPrice);
  const oh = num(quote.vendorOhPct);
  const dev = num(quote.developmentCost);
  const freight = num(quote.freightCost);
  const freightPerPc = qty > 0 ? freight / qty : 0;
  return unitPrice + unitPrice * oh + dev + freightPerPc;
}

/** A top-3 placement on one criterion: L1 (best) / L2 / L3, or null (outside the top 3). */
export type CriterionRank = 1 | 2 | 3 | null;

/** Per-quote rank on each of the three criteria (null = not in that criterion's top 3). */
export interface VendorRanks {
  /** 1|2|3 by ascending landed cost (cheapest = 1); null if unranked or no unitPrice. */
  costRank: CriterionRank;
  /** 1|2|3 by ascending lead time (fastest = 1); null if unranked or no lead. */
  deliveryRank: CriterionRank;
  /** 1|2|3 by descending credit period (longest = 1); null if unranked or no credit. */
  creditRank: CriterionRank;
}

/** Result of ranking a set of vendor quotes. */
export interface VendorComparison {
  /** Quote id with the lowest landed cost (excludes rows with no unitPrice). Equals costTop3[0]. null if none rankable. */
  cheapestId: string | null;
  /** Quote id with the lowest leadTimeDays (ignores null lead). Equals deliveryTop3[0]. null if none have a lead. */
  fastestId: string | null;
  /** Quote id with the highest creditPeriodDays (ignores null credit). Equals creditTop3[0]. null if none have a credit. */
  bestCreditId: string | null;
  /** landed cost per piece, keyed by quote id (every quote with an id is present). */
  byId: Record<string, number>;
  /** Ranked quote ids by ascending landed cost: index 0 = L1, 1 = L2, 2 = L3 (up to 3, fewer if fewer qualify). */
  costTop3: string[];
  /** Ranked quote ids by ascending lead time: index 0 = L1 … 2 = L3. */
  deliveryTop3: string[];
  /** Ranked quote ids by descending credit period: index 0 = L1 … 2 = L3. */
  creditTop3: string[];
  /** Per-quote L1/L2/L3 ranks on each criterion, keyed by quote id (every quote with an id is present). */
  ranks: Record<string, VendorRanks>;
  /** Count (0..3) of criteria in which the quote places top-3, keyed by quote id. */
  topThreeScore: Record<string, number>;
}

/** One quote's eligibility + sort key on a single criterion. */
interface Candidate {
  id: string;
  value: number;
  index: number;
}

/**
 * Rank candidates and return the top-3 ids (L1..L3). Stable: ties break by input
 * index (lowest wins), so the caller's row order is honoured. `dir` = "asc" ranks
 * smallest-first (cost, lead); "desc" ranks largest-first (credit).
 */
function top3(candidates: Candidate[], dir: "asc" | "desc"): string[] {
  const sorted = [...candidates].sort(
    (a, b) => (dir === "asc" ? a.value - b.value : b.value - a.value) || a.index - b.index,
  );
  return sorted.slice(0, 3).map((c) => c.id);
}

/**
 * Rank vendor quotes on three axes with an L1/L2/L3 top-3 per criterion. Null-safe:
 *  - cost: ascending landed cost; excludes rows with no unitPrice. L1 = cheapest.
 *  - delivery: ascending leadTimeDays, ignoring null. L1 = fastest.
 *  - credit: descending creditPeriodDays, ignoring null. L1 = longest credit.
 * Ties break by input order (lowest index wins). Fewer than 3 qualifiers ⇒ shorter
 * top-3 lists (2 vendors ⇒ L1,L2 only). Every quote with an id also gets a `ranks`
 * entry (1|2|3|null per criterion) and a `topThreeScore` (0..3 = criteria placed).
 * `cheapestId`/`fastestId`/`bestCreditId` are retained as each criterion's L1 so
 * existing badges keep working. `byId` carries the landed cost for every quote. Pure.
 */
export function compareVendors(
  quotes: readonly VendorQuoteLike[],
  qty: number,
): VendorComparison {
  const byId: Record<string, number> = {};
  const ranks: Record<string, VendorRanks> = {};
  const topThreeScore: Record<string, number> = {};

  const costCand: Candidate[] = [];
  const deliveryCand: Candidate[] = [];
  const creditCand: Candidate[] = [];

  let index = 0;
  for (const q of quotes) {
    if (!q.id) continue;
    const landed = vendorLandedCost(q, qty);
    byId[q.id] = landed;
    ranks[q.id] = { costRank: null, deliveryRank: null, creditRank: null };
    topThreeScore[q.id] = 0;

    if (hasNum(q.unitPrice)) costCand.push({ id: q.id, value: landed, index });
    if (hasInt(q.leadTimeDays)) deliveryCand.push({ id: q.id, value: q.leadTimeDays, index });
    if (hasInt(q.creditPeriodDays))
      creditCand.push({ id: q.id, value: q.creditPeriodDays, index });
    index += 1;
  }

  const costTop3 = top3(costCand, "asc");
  const deliveryTop3 = top3(deliveryCand, "asc");
  const creditTop3 = top3(creditCand, "desc");

  const applyRanks = (
    top: string[],
    key: "costRank" | "deliveryRank" | "creditRank",
  ) => {
    top.forEach((id, i) => {
      const rank = (i + 1) as CriterionRank;
      const r = ranks[id];
      if (r) {
        r[key] = rank;
        topThreeScore[id] = (topThreeScore[id] ?? 0) + 1;
      }
    });
  };
  applyRanks(costTop3, "costRank");
  applyRanks(deliveryTop3, "deliveryRank");
  applyRanks(creditTop3, "creditRank");

  return {
    cheapestId: costTop3[0] ?? null,
    fastestId: deliveryTop3[0] ?? null,
    bestCreditId: creditTop3[0] ?? null,
    byId,
    costTop3,
    deliveryTop3,
    creditTop3,
    ranks,
    topThreeScore,
  };
}
