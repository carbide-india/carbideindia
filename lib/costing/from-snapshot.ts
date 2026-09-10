import "server-only";
import { randomUUID } from "node:crypto";
import {
  emptyInhouseCalculatorValue,
  type InhouseCalculatorValue,
} from "@/lib/costing/inhouse-master";
import type { BuyoutValue } from "@/components/costings/buyout-calculator";
import type { CostingCalculatorInitial } from "@/lib/costing/calculator-initial";

/**
 * Rehydrate the Costing Master calculator from the JSON snapshot stored on a
 * costing (`costings.calculator_snapshot`). The snapshot IS the last-saved
 * SaveCostingMaster payload, so this is a lossless round-trip — every in-house
 * field and every bought-out vendor comes back exactly as entered, including the
 * UI-only inputs (batch details, total weight, internal machining rate) the
 * typed columns don't store. Used only by the Costing Master page (server).
 *
 * Robust to a null / malformed snapshot: returns null so the caller falls back
 * to a blank calculator rather than throwing.
 */

export type { CostingCalculatorInitial } from "@/lib/costing/calculator-initial";

const numOrEmpty = (v: unknown): number | "" =>
  typeof v === "number" && Number.isFinite(v) ? v : "";
const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** The buyout vendor rows hold every numeric field as a STRING, but the saved
 *  snapshot keeps them as NUMBERS (schema `OptNum`). Stringify so the prices,
 *  overhead %, lead/credit days and delivery/validity re-appear on edit. */
const numToStr = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v)
    ? String(v)
    : typeof v === "string"
      ? v
      : "";

/** payload.inhouse (whole-number percents, reshaped sub-rows) → calculator value. */
function inhouseFromSnapshot(raw: unknown): InhouseCalculatorValue {
  const base = emptyInhouseCalculatorValue();
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    ...base,
    finishedSize: str(p.finishedSize),
    toleranceSize: str(p.toleranceSize),
    sinteredSize: str(p.sinteredSize),
    greenSize: str(p.greenSize),
    shrinkage: str(p.shrinkage),
    toolingChartId: str(p.toolingChartId),
    toolType: (p.toolType as InhouseCalculatorValue["toolType"]) ?? "perfect",
    levyToolMode: (p.levyToolMode as InhouseCalculatorValue["levyToolMode"]) ?? "none",
    levyToolAmount: numOrEmpty(p.levyToolAmount),
    weightMethod: (p.weightMethod as InhouseCalculatorValue["weightMethod"]) ?? 1,
    blockWt: numOrEmpty(p.blockWt),
    theoreticalWt: numOrEmpty(p.theoreticalWt),
    pressingWt: numOrEmpty(p.pressingWt),
    totalWt: numOrEmpty(p.totalWt),
    lossPct: numOrEmpty(p.lossPct),
    rmPerKg: numOrEmpty(p.rmPerKg),
    batchDetails: str(p.batchDetails),
    vaPct: numOrEmpty(p.vaPct),
    vaFloorPerKg: numOrEmpty(p.vaFloorPerKg),
    shapingMins: numOrEmpty(p.shapingMins),
    shapingRatePerMin: numOrEmpty(p.shapingRatePerMin),
    mandrilRate: numOrEmpty(p.mandrilRate),
    mandrilSize: numOrEmpty(p.mandrilSize),
    devCosts: arr(p.devCosts).map((d) => {
      const row = (d ?? {}) as Record<string, unknown>;
      return {
        id: randomUUID(),
        description: str(row.description),
        qty: numOrEmpty(row.qty),
        rate: numOrEmpty(row.rate),
        amount: numOrEmpty(row.amount),
        levyMode: (row.levyMode as InhouseCalculatorValue["levyToolMode"]) ?? "none",
      };
    }),
    machiningOps: arr(p.machiningOps).map((m) => {
      const row = (m ?? {}) as Record<string, unknown>;
      return { id: randomUUID(), optionId: str(row.optionId), minutes: numOrEmpty(row.minutes), rate: numOrEmpty(row.rate) };
    }),
    internalMachiningRate: numOrEmpty(p.internalMachiningRate),
    externalVendors: arr(p.externalVendors).map((e) => {
      const row = (e ?? {}) as Record<string, unknown>;
      return { id: randomUUID(), vendorId: str(row.vendorId), rate: numOrEmpty(row.rate) };
    }),
    machiningChoice: str(p.machiningChoice) || "internal",
    overheadPct: numOrEmpty(p.overheadPct),
    negotiationPct: numOrEmpty(p.negotiationPct),
    qty: numOrEmpty(p.qty),
  };
}

/** payload.buyout (already the BuyoutValue shape) → calculator value. */
function buyoutFromSnapshot(raw: unknown): BuyoutValue {
  if (!raw || typeof raw !== "object") return { vendors: [], selectedKey: null };
  const p = raw as Record<string, unknown>;
  const vendorsRaw = Array.isArray(p.vendors) ? p.vendors : [];
  const vendors = vendorsRaw.map((v) => {
    const row = (v ?? {}) as Record<string, unknown>;
    const key = str(row.key) || randomUUID();
    return {
      key,
      vendorId: (row.vendorId as string | null) ?? null,
      vendorName: str(row.vendorName),
      vendorCode: (row.vendorCode as string | null) ?? null,
      unitPrice: numToStr(row.unitPrice),
      vendorOhPct: numToStr(row.vendorOhPct),
      developmentCost: numToStr(row.developmentCost),
      leadTimeDays: numToStr(row.leadTimeDays),
      creditPeriodDays: numToStr(row.creditPeriodDays),
      paymentTerms: (row.paymentTerms as string | null) ?? null,
      paymentTermsId: str(row.paymentTermsId),
      quantityToleranceId: str(row.quantityToleranceId),
      deliveryTime: numToStr(row.deliveryTime),
      deliveryTimeUnit: (str(row.deliveryTimeUnit) as "days" | "weeks") || "days",
      validity: numToStr(row.validity),
      validityUnit: (str(row.validityUnit) as "days" | "weeks") || "days",
      quoteLink: str(row.quoteLink),
      notes: str(row.notes),
    };
  });
  const selectedKey =
    typeof p.selectedKey === "string" && vendors.some((v) => v.key === p.selectedKey)
      ? p.selectedKey
      : vendors[0]?.key ?? null;
  return { vendors, selectedKey };
}

export function initialFromSnapshot(snapshot: unknown): CostingCalculatorInitial | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const mode = s.costingMode;
  if (mode !== "inhouse" && mode !== "bought_out" && mode !== "both") return null;
  return {
    mode,
    soldBefore: typeof s.soldBefore === "boolean" ? s.soldBefore : undefined,
    qty: numOrEmpty(s.qty),
    inhouse: inhouseFromSnapshot(s.inhouse),
    buyout: buyoutFromSnapshot(s.buyout),
    quantityToleranceId: str(s.quantityToleranceId),
    deliveryTime: (s.deliveryTime as string | null) ?? null,
    validity: (s.validity as string | null) ?? null,
    paymentTerms: (s.paymentTerms as string | null) ?? null,
    technicalNotes: str(s.technicalNotes),
    commercialNotes: str(s.commercialNotes),
  };
}
