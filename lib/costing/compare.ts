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

/** Result of ranking a set of vendor quotes. */
export interface VendorComparison {
  /** Quote id with the lowest landed cost (excludes rows with no unitPrice). null if none rankable. */
  cheapestId: string | null;
  /** Quote id with the lowest leadTimeDays (ignores null lead). null if none have a lead. */
  fastestId: string | null;
  /** Quote id with the highest creditPeriodDays (ignores null credit). null if none have a credit. */
  bestCreditId: string | null;
  /** landed cost per piece, keyed by quote id (every quote with an id is present). */
  byId: Record<string, number>;
}

/**
 * Rank vendor quotes on three axes. Null-safe:
 *  - cheapest: excludes rows with no unitPrice; ties keep the first (lowest index).
 *  - fastest: min leadTimeDays, ignoring null; ties keep the first.
 *  - bestCredit: max creditPeriodDays, ignoring null; ties keep the first.
 * `byId` carries the landed cost for every quote that has an id. Pure.
 */
export function compareVendors(
  quotes: readonly VendorQuoteLike[],
  qty: number,
): VendorComparison {
  const byId: Record<string, number> = {};
  let cheapestId: string | null = null;
  let cheapestVal = Infinity;
  let fastestId: string | null = null;
  let fastestVal = Infinity;
  let bestCreditId: string | null = null;
  let bestCreditVal = -Infinity;

  for (const q of quotes) {
    if (!q.id) continue;
    const landed = vendorLandedCost(q, qty);
    byId[q.id] = landed;

    if (hasNum(q.unitPrice) && landed < cheapestVal) {
      cheapestVal = landed;
      cheapestId = q.id;
    }
    if (hasInt(q.leadTimeDays) && q.leadTimeDays < fastestVal) {
      fastestVal = q.leadTimeDays;
      fastestId = q.id;
    }
    if (hasInt(q.creditPeriodDays) && q.creditPeriodDays > bestCreditVal) {
      bestCreditVal = q.creditPeriodDays;
      bestCreditId = q.id;
    }
  }

  return { cheapestId, fastestId, bestCreditId, byId };
}
