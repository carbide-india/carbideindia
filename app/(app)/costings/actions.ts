"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { costings, costingVendorQuotes, inquiryItems, type NewCosting } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import {
  CreateCostingSchema,
  type CreateCostingInput,
  SaveCostingMasterSchema,
  type SaveCostingMasterInput,
  type InhousePayloadOut,
  type BuyoutPayloadOut,
} from "@/lib/validators/costing";
import {
  computeInhouseCosting,
  computeBoCosting,
  compareVendors,
  vendorLandedCost,
} from "@/lib/costing/compute";
import {
  computeInhouseMaster,
  type InhouseCalculatorValue,
} from "@/lib/costing/inhouse-master";
import { getCostingDecision } from "@/lib/queries/costings";
import { isItemFeasibilityConfirmed } from "@/lib/queries/feasibility";
import type { CostingRoute } from "@/db/enums";

type SaveCostingResult =
  | { ok: true; id: string; finalCostPerPiece: number }
  | { ok: false; error: string };

/**
 * Persist a new costing row - server-recomputes all outputs via the pure
 * engine (never trusts client-sent computed values). Guarantees exactly one
 * chosen costing per inquiry_item by clearing `is_chosen` on siblings first.
 */
export async function saveCosting(
  input: CreateCostingInput,
): Promise<SaveCostingResult> {
  const me = await requireUser();

  const parsed = CreateCostingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const v = parsed.data;

  // ── Integrity: the product line MUST belong to the inquiry being gated ──
  // Without this, a caller could pair an approved inquiryId with an
  // inquiryItemId from a different (un-approved) inquiry and slip past the
  // feasibility gate below.
  const [ownItem] = await db
    .select({ inquiryId: inquiryItems.inquiryId })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, v.inquiryItemId))
    .limit(1);
  if (!ownItem) {
    return { ok: false, error: "Product line not found." };
  }
  if (ownItem.inquiryId !== v.inquiryId) {
    return { ok: false, error: "Product line does not belong to this enquiry." };
  }

  // ── Lock guard: a locked/approved chosen costing cannot be re-costed ──
  // An admin must explicitly unlock it first (unlockCostingDecision).
  const [lockedRow] = await db
    .select({ id: costings.id })
    .from(costings)
    .where(
      and(
        eq(costings.inquiryItemId, v.inquiryItemId),
        eq(costings.isChosen, true),
        eq(costings.isLocked, true),
      ),
    )
    .limit(1);
  if (lockedRow) {
    return {
      ok: false,
      error: "This costing is approved and locked - unlock it to re-cost.",
    };
  }

  // ── Hard gate: costing is blocked until this line's feasibility is CONFIRMED ──
  // The strong per-item gate (feasibility_confirmed = true, set after Lock
  // Dimensions in Primary Feasibility). Enforces the professional pipeline; an
  // unconfirmed / not-feasible / pending line cannot be costed.
  if (!(await isItemFeasibilityConfirmed(v.inquiryItemId))) {
    return {
      ok: false,
      error:
        "This product line's feasibility is not confirmed yet - confirm it in Primary Feasibility before costing.",
    };
  }

  // ── Apply rate-field defaults (only when the field was omitted) ──
  const lossPct = v.lossPct ?? 0.15;
  const vaFloorPerKg = v.vaFloorPerKg ?? 2000;
  const overheadPct = v.overheadPct ?? 0.25;
  const negotiationPct = v.negotiationPct ?? 0.03;
  const shapingRatePerMin = v.shapingRatePerMin ?? 7;
  const vaPct = v.vaPct ?? 0.3;
  const shapingMins = v.shapingMins ?? 2;
  const machiningRate = v.machiningRate ?? 0;
  const qty = v.qty ?? 0;

  try {
    let finalCostPerPiece: number;
    let quoteValue: number;

    // Columns that only inhouse fills (BO leaves them null)
    let lossWt: string | null = null;
    let rmPerGm: string | null = null;
    let vaPerGm: string | null = null;
    let sinteredCostPerGm: string | null = null;
    let sinteredPricePerPiece: string | null = null;
    let shapingCostPerPiece: string | null = null;
    let machiningCostPerPiece: string | null = null;
    let costAfterMachining: string | null = null;
    let negotiationAmount: string | null = null;

    if (v.costingType === "inhouse") {
      const weightUsed: "pressing" | "theoretical" | "block" =
        v.weightUsed === "pressing" ||
        v.weightUsed === "theoretical" ||
        v.weightUsed === "block"
          ? v.weightUsed
          : "pressing";

      const out = computeInhouseCosting({
        qty,
        toolFlatCost: v.toolFlatCost,
        weightUsed,
        blockWt: v.blockWt,
        theoreticalWt: v.theoreticalWt,
        pressingWt: v.pressingWt,
        lossPct,
        rmPricePerKg: v.rmPricePerKg ?? 0,
        vaPct,
        vaFloorPerKg,
        shapingMins,
        shapingRatePerMin,
        machiningRate,
        overheadPct,
        negotiationPct,
      });

      finalCostPerPiece = out.finalCostPerPiece;
      quoteValue = out.quoteValue;
      lossWt = String(out.lossWtKg);
      rmPerGm = String(out.rmPerGm);
      vaPerGm = String(out.vaPerGm);
      sinteredCostPerGm = String(out.sinteredCostPerGm);
      sinteredPricePerPiece = String(out.sinteredPricePerPiece);
      shapingCostPerPiece = String(out.shapingCostPerPiece);
      machiningCostPerPiece = String(out.machiningCostPerPiece);
      costAfterMachining = String(out.costAfterMachining);
      negotiationAmount = String(out.negotiationAmount);
    } else {
      const out = computeBoCosting({
        qty,
        outsourcedVendorCost: v.outsourcedVendorCost ?? 0,
        vendorOhPct: v.vendorOhPct ?? 0,
        developmentCost: v.developmentCost ?? 0,
      });
      finalCostPerPiece = out.finalCostPerPiece;
      quoteValue = out.quoteValue;
    }

    // BO multi-vendor matrix: when a bought-out costing carries vendorQuotes,
    // the server ranks them and the recommended (cheapest) landed cost REPLACES
    // whatever the single-vendor BO fields produced above.
    const boQuotes =
      v.costingType === "bought_out" &&
      Array.isArray(v.vendorQuotes) &&
      v.vendorQuotes.length > 0
        ? v.vendorQuotes.slice(0, 5)
        : null;

    const inserted = await db.transaction(async (tx) => {
      // ── Exactly-one-chosen guarantee ──
      // If this new costing is chosen (default true per schema), clear any other
      // chosen costings for the same inquiry_item first.
      const isChosen = true; // new costings are always chosen on creation
      if (isChosen) {
        await tx
          .update(costings)
          .set({ isChosen: false })
          .where(
            and(
              eq(costings.inquiryItemId, v.inquiryItemId),
              eq(costings.isChosen, true),
            ),
          );
      }

      // ── Insert the new costing row ──
      const [row] = await tx
      .insert(costings)
      .values({
        inquiryItemId: v.inquiryItemId,
        inquiryId: v.inquiryId,
        costingType: v.costingType,
        costingLogic: v.costingLogic,
        isChosen,
        // inputs
        qty: v.qty != null ? String(v.qty) : null,
        toolType: v.toolType,
        toolCostMethod: v.toolCostMethod,
        toolFlatCost: v.toolFlatCost != null ? String(v.toolFlatCost) : null,
        blockWt: v.blockWt != null ? String(v.blockWt) : null,
        theoreticalWt:
          v.theoreticalWt != null ? String(v.theoreticalWt) : null,
        pressingWt: v.pressingWt != null ? String(v.pressingWt) : null,
        weightUsed: v.weightUsed,
        lossPct: String(lossPct),
        rmPricePerKg:
          v.rmPricePerKg != null ? String(v.rmPricePerKg) : null,
        vaPct: String(vaPct),
        vaFloorPerKg: String(vaFloorPerKg),
        shapingRatePerMin: String(shapingRatePerMin),
        shapingMins: String(shapingMins),
        machiningType: v.machiningType,
        machiningRate: String(machiningRate),
        overheadPct: String(overheadPct),
        negotiationPct: String(negotiationPct),
        outsourcedVendorCost:
          v.outsourcedVendorCost != null
            ? String(v.outsourcedVendorCost)
            : null,
        vendorOhPct:
          v.vendorOhPct != null ? String(v.vendorOhPct) : null,
        vendorNotes: v.vendorNotes,
        developmentCost:
          v.developmentCost != null ? String(v.developmentCost) : null,
        developmentNotes: v.developmentNotes,
        technicalNotes: v.technicalNotes,
        // computed outputs (server-recomputed, never from client)
        lossWt,
        rmPerGm,
        vaPerGm,
        sinteredCostPerGm,
        sinteredPricePerPiece,
        shapingCostPerPiece,
        machiningCostPerPiece,
        costAfterMachining,
        negotiationAmount,
        finalCostPerPiece: String(finalCostPerPiece),
        quoteValue: String(quoteValue),
        // meta
        developmentTime: v.developmentTime,
        deliveryTime: v.deliveryTime,
        validity: v.validity,
        createdById: me.id,
      })
      .returning({ id: costings.id });

      if (!row) {
        // Force rollback of the sibling-clear update above.
        throw new Error("insert-failed");
      }

      // ── BO multi-vendor matrix: persist quotes + recommend cheapest ──
      let finalForCaller = finalCostPerPiece;
      if (boQuotes) {
        // Idempotent replace: drop any existing quotes for this costing, then
        // insert the (≤5) rows with sortOrder by index and a name snapshot.
        await tx
          .delete(costingVendorQuotes)
          .where(eq(costingVendorQuotes.costingId, row.id));

        const insertedQuotes = await tx
          .insert(costingVendorQuotes)
          .values(
            boQuotes.map((q, i) => ({
              costingId: row.id,
              vendorId: q.vendorId ?? null,
              vendorNameSnapshot: q.vendorNameSnapshot ?? null,
              unitPrice: String(q.unitPrice),
              leadTimeDays: q.leadTimeDays ?? null,
              creditPeriodDays: q.creditPeriodDays ?? null,
              freightCost: q.freightCost != null ? String(q.freightCost) : null,
              vendorOhPct: q.vendorOhPct != null ? String(q.vendorOhPct) : null,
              developmentCost:
                q.developmentCost != null ? String(q.developmentCost) : null,
              sortOrder: i,
              notes: q.notes ?? null,
            })),
          )
          .returning();

        // SERVER-recompute the ranking; the cheapest landed cost is authoritative.
        const cmp = compareVendors(insertedQuotes, qty);
        const cheapestId = cmp.cheapestId;
        const cheapestLanded =
          cheapestId != null ? cmp.byId[cheapestId] ?? 0 : 0;

        finalForCaller = cheapestLanded;
        await tx
          .update(costings)
          .set({
            recommendedVendorQuoteId: cheapestId,
            finalCostPerPiece: String(cheapestLanded),
            quoteValue: String(cheapestLanded * qty),
          })
          .where(eq(costings.id, row.id));
      }

      return { id: row.id, finalCostPerPiece: finalForCaller };
    });

    revalidatePath("/costings");
    revalidatePath("/inquiries/" + v.inquiryId);

    return {
      ok: true,
      id: inserted.id,
      finalCostPerPiece: inserted.finalCostPerPiece,
    };
  } catch (err) {
    console.error("[saveCosting]", err);
    return {
      ok: false,
      error: "Could not save the costing - please try again.",
    };
  }
}

// ── Phase 4: Costing Decision (approve / override / lock) — admin only ────────

type ApproveCostingResult =
  | { ok: true; finalUnitCost: number; isOverridden: boolean }
  | { ok: false; error: string };

export interface ApproveCostingInput {
  inquiryItemId: string;
  approvedOption: CostingRoute;
  /** Winning BO vendor quote — only meaningful when approvedOption is bought_out. */
  chosenVendorQuoteId?: string | null;
  overrideReason?: string | null;
}

/**
 * Approve a costing decision for one inquiry_item: pick the path (and, for a
 * bought-out approval, the winning vendor), lock it, and snapshot the final unit
 * cost that feeds the quotation. Admin-only. Re-asserts item↔inquiry ownership
 * and the feasibility gate, recomputes the recommendation server-side, and
 * REQUIRES a reason whenever the approval diverges from the recommendation.
 */
export async function approveCostingDecision(
  input: ApproveCostingInput,
): Promise<ApproveCostingResult> {
  const me = await requireAdmin();

  const inquiryItemId = input.inquiryItemId;
  if (!inquiryItemId) {
    return { ok: false, error: "Missing product line." };
  }
  if (input.approvedOption !== "inhouse" && input.approvedOption !== "bought_out") {
    return { ok: false, error: "Invalid costing option." };
  }
  const approvedOption = input.approvedOption;

  // ── Integrity: resolve the item + its parent inquiry ──
  const [ownItem] = await db
    .select({ inquiryId: inquiryItems.inquiryId })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!ownItem) {
    return { ok: false, error: "Product line not found." };
  }

  // ── Hard gate: this line's feasibility must be CONFIRMED before a decision locks ──
  if (!(await isItemFeasibilityConfirmed(inquiryItemId))) {
    return {
      ok: false,
      error:
        "This product line's feasibility is not confirmed yet - confirm it in Primary Feasibility before costing.",
    };
  }

  try {
    // Recompute the recommendation + fetch both candidate rows server-side.
    const decision = await getCostingDecision(inquiryItemId);
    const rec = decision.recommendation;
    if (!rec) {
      return { ok: false, error: "No costing exists for this product line yet." };
    }

    const targetRow =
      approvedOption === "inhouse" ? decision.inhouse : decision.boughtOut;
    if (!targetRow) {
      return {
        ok: false,
        error:
          approvedOption === "inhouse"
            ? "No in-house costing exists to approve."
            : "No bought-out costing exists to approve.",
      };
    }

    // ── Resolve the winning BO vendor (bought-out only) ──
    // Defaults to the BO row's recommended (cheapest-landed) vendor when the
    // admin doesn't pin one. Any supplied id must belong to this BO costing.
    const boRecommendedVendorId =
      decision.boughtOut?.recommendedVendorQuoteId ?? null;
    let effectiveChosenVendorId: string | null = null;
    if (approvedOption === "bought_out") {
      const supplied = input.chosenVendorQuoteId ?? null;
      if (supplied) {
        const owns = decision.boughtOut?.vendorQuotes.some((q) => q.id === supplied);
        if (!owns) {
          return { ok: false, error: "Selected vendor quote does not belong to this costing." };
        }
        effectiveChosenVendorId = supplied;
      } else {
        effectiveChosenVendorId = boRecommendedVendorId;
      }
    }

    // ── Override detection ──
    // Overridden when the approved path isn't the recommended one, or when a
    // bought-out approval pins a vendor other than the recommended cheapest.
    let isOverridden = approvedOption !== rec.recommendedOption;
    if (approvedOption === "bought_out" && effectiveChosenVendorId !== boRecommendedVendorId) {
      isOverridden = true;
    }

    const reason = (input.overrideReason ?? "").trim();
    if (isOverridden && reason === "") {
      return {
        ok: false,
        error: "An override reason is required when the approval differs from the recommendation.",
      };
    }

    // ── Final unit cost that feeds Form 06 ──
    let finalUnitCost: number;
    if (approvedOption === "inhouse") {
      finalUnitCost = Number(targetRow.finalCostPerPiece ?? 0);
    } else {
      const bo = decision.boughtOut!;
      const qty = Number(bo.qty ?? 0);
      const picked = effectiveChosenVendorId
        ? bo.vendorQuotes.find((q) => q.id === effectiveChosenVendorId)
        : null;
      finalUnitCost = picked
        ? vendorLandedCost(picked, qty)
        : Number(bo.finalCostPerPiece ?? 0);
    }

    const targetId = targetRow.id;
    await db.transaction(async (tx) => {
      // Exactly-one-chosen: clear every sibling on this item.
      await tx
        .update(costings)
        .set({ isChosen: false })
        .where(and(eq(costings.inquiryItemId, inquiryItemId), ne(costings.id, targetId)));

      await tx
        .update(costings)
        .set({
          isChosen: true,
          approvedOption,
          recommendedOption: rec.recommendedOption,
          recommendedVendorQuoteId: rec.recommendedVendorQuoteId,
          chosenVendorQuoteId: effectiveChosenVendorId,
          isOverridden,
          overrideReason: isOverridden ? reason : null,
          finalUnitCost: String(finalUnitCost),
          approverId: me.id,
          approvedAt: new Date(),
          isLocked: true,
          updatedAt: new Date(),
        })
        .where(eq(costings.id, targetId));
    });

    revalidatePath("/costings");
    revalidatePath("/inquiries/" + ownItem.inquiryId);

    return { ok: true, finalUnitCost, isOverridden };
  } catch (err) {
    console.error("[approveCostingDecision]", err);
    return { ok: false, error: "Could not approve the costing - please try again." };
  }
}

type UnlockCostingResult = { ok: true } | { ok: false; error: string };

/**
 * Reverse a costing approval so the item can be re-costed. Admin-only. Clears
 * the lock + approval snapshot on the chosen costing (keeps the row and its
 * computed numbers; only the decision layer is wiped).
 */
export async function unlockCostingDecision(
  inquiryItemId: string,
): Promise<UnlockCostingResult> {
  await requireAdmin();

  if (!inquiryItemId) {
    return { ok: false, error: "Missing product line." };
  }

  try {
    const [chosen] = await db
      .select({ id: costings.id, inquiryId: costings.inquiryId })
      .from(costings)
      .where(and(eq(costings.inquiryItemId, inquiryItemId), eq(costings.isChosen, true)))
      .limit(1);
    if (!chosen) {
      return { ok: false, error: "No approved costing to unlock." };
    }

    await db
      .update(costings)
      .set({
        isLocked: false,
        approvedAt: null,
        approverId: null,
        approvedOption: null,
        overrideReason: null,
        isOverridden: false,
        finalUnitCost: null,
        updatedAt: new Date(),
      })
      .where(eq(costings.id, chosen.id));

    revalidatePath("/costings");
    revalidatePath("/inquiries/" + chosen.inquiryId);

    return { ok: true };
  } catch (err) {
    console.error("[unlockCostingDecision]", err);
    return { ok: false, error: "Could not unlock the costing - please try again." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Costing Master engine v3 (spec 2026-07-30) — the calculator SHELL save.
//
// Persists the full Costing Master flow: ONE row for a single path (In-House or
// Bought-Out), or TWO rows (in-house + bought-out) for the "Both" flow, with the
// cross-path recommendation set to the cheaper. All outputs are RECOMPUTED
// server-side (In-House via `computeInhouseMaster`/mfg-engine; Bought-Out via
// `compareVendors`) — the client's numbers are never trusted. Reuses the exact
// same feasibility gate, lock guard, exactly-one-chosen guarantee and Phase-4
// approve/lock decision plumbing as `saveCosting`.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** number | undefined | null → decimal string for a numeric column, else null. */
function numStr(v: number | undefined | null): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}
/** Whole-percent (30) → fraction string ("0.3"), else null. */
function fracStr(v: number | undefined | null): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v / 100) : null;
}
/** A uuid string or null (drops the NEW_TOOL sentinel / blanks). */
function uuidOrNull(v: string | undefined | null): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}
/** Trimmed non-empty text, else null. */
function textOrNull(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

type InhouseInput = InhousePayloadOut;
type BuyoutInput = BuyoutPayloadOut;

/** Map a validated In-House payload (+ resolved qty) onto the shared value shape. */
function toInhouseValue(p: InhouseInput, qty: number): InhouseCalculatorValue {
  const n = (v: unknown): number | "" =>
    typeof v === "number" && Number.isFinite(v) ? v : "";
  return {
    finishedSize: p.finishedSize ?? "",
    toleranceSize: p.toleranceSize ?? "",
    sinteredSize: p.sinteredSize ?? "",
    greenSize: p.greenSize ?? "",
    shrinkage: p.shrinkage ?? "",
    toolingChartId: p.toolingChartId ?? "",
    toolType: p.toolType ?? "perfect",
    levyToolMode: p.levyToolMode ?? "none",
    levyToolAmount: n(p.levyToolAmount),
    weightMethod: (p.weightMethod ?? 1) as InhouseCalculatorValue["weightMethod"],
    blockWt: n(p.blockWt),
    theoreticalWt: n(p.theoreticalWt),
    pressingWt: n(p.pressingWt),
    totalWt: n(p.totalWt),
    lossPct: n(p.lossPct),
    rmPerKg: n(p.rmPerKg),
    batchDetails: p.batchDetails ?? "",
    vaPct: n(p.vaPct),
    vaFloorPerKg: n(p.vaFloorPerKg),
    shapingMins: n(p.shapingMins),
    shapingRatePerMin: n(p.shapingRatePerMin),
    mandrilRate: n(p.mandrilRate),
    mandrilSize: n(p.mandrilSize),
    devCosts: (p.devCosts ?? []).map((d) => ({
      id: randomUUID(),
      description: d.description ?? "",
      qty: n(d.qty),
      rate: n(d.rate),
      amount: n(d.amount),
      levyMode: d.levyMode ?? "none",
    })),
    machiningOps: (p.machiningOps ?? []).map((m) => ({
      id: randomUUID(),
      optionId: m.optionId ?? "",
      minutes: n(m.minutes),
      rate: n(m.rate),
    })),
    internalMachiningRate: n(p.internalMachiningRate),
    externalVendors: (p.externalVendors ?? []).map((e) => ({
      id: randomUUID(),
      vendorId: e.vendorId ?? "",
      rate: n(e.rate),
    })),
    machiningChoice: p.machiningChoice ?? "internal",
    overheadPct: n(p.overheadPct),
    negotiationPct: n(p.negotiationPct),
    qty,
  };
}

/** Terminal fields (shared across every persisted row). */
interface TerminalFields {
  quantityToleranceId: string | null;
  deliveryTime: string | null;
  validity: string | null;
  paymentTerms: string | null;
  technicalNotes: string | null;
  developmentNotes: string | null;
}

/** Build the In-House costing insert values (server-recomputed via the engine). */
function buildInhouseRow(
  base: { inquiryItemId: string; inquiryId: string; createdById: string; isChosen: boolean },
  p: InhouseInput,
  qty: number,
  terminal: TerminalFields,
): { row: NewCosting; finalPerPiece: number } {
  const value = toInhouseValue(p, qty);
  const totals = computeInhouseMaster(value);
  const e = totals.engine;
  const levy = p.levyToolMode ?? "none";
  const weightUsed =
    (p.weightMethod ?? 1) <= 2 ? "pressing" : "theoretical";

  const row: NewCosting = {
    inquiryItemId: base.inquiryItemId,
    inquiryId: base.inquiryId,
    costingType: "inhouse",
    isChosen: base.isChosen,
    qty: numStr(qty),
    // sizes
    finishedSize: value.finishedSize || null,
    toleranceSize: value.toleranceSize || null,
    sinteredSize: value.sinteredSize || null,
    greenSize: value.greenSize || null,
    shrinkage: value.shrinkage || null,
    // tooling
    toolingChartId: uuidOrNull(p.toolingChartId),
    toolType: p.toolType ?? null,
    toolCostMethod: levy,
    toolFlatCost: levy === "flat" ? numStr(totalNum(p.levyToolAmount)) : null,
    toolPerPieceCost: levy === "per_piece" ? numStr(totalNum(p.levyToolAmount)) : null,
    // weight
    weightMethod: p.weightMethod ?? null,
    weightUsed,
    blockWt: numStr(totalNum(p.blockWt)),
    theoreticalWt: numStr(totalNum(p.theoreticalWt)),
    pressingWt: numStr(totalNum(p.pressingWt)),
    lossPct: fracStr(totalNum(p.lossPct)),
    // RM + VA
    rmPricePerKg: numStr(totalNum(p.rmPerKg)),
    vaPct: fracStr(totalNum(p.vaPct)),
    vaFloorPerKg: numStr(totalNum(p.vaFloorPerKg)),
    // shaping
    shapingRatePerMin: numStr(totalNum(p.shapingRatePerMin)),
    shapingMins: numStr(totalNum(p.shapingMins)),
    // mandril
    mandrilRate: numStr(totalNum(p.mandrilRate)),
    mandrilSize: numStr(totalNum(p.mandrilSize)),
    // machining
    machiningType: p.machiningChoice ?? null,
    machiningRate: numStr(totals.machiningBase),
    overheadPct: fracStr(totalNum(p.overheadPct)),
    negotiationPct: fracStr(totalNum(p.negotiationPct)),
    machiningOps: (p.machiningOps ?? []).map((m) => ({
      opId: m.optionId ?? "",
      label: m.label ?? "",
      minutes: totalNum(m.minutes) ?? 0,
      rate: totalNum(m.rate) ?? 0,
      internal: p.machiningChoice === "internal",
      vendorId: undefined,
    })),
    externalMachiningVendors: (p.externalVendors ?? []).map((ev) => ({
      vendorId: ev.vendorId ?? "",
      label: ev.label ?? "",
      rate: totalNum(ev.rate) ?? 0,
    })),
    devCosts: (p.devCosts ?? []).map((d) => ({
      description: d.description ?? "",
      qty: totalNum(d.qty) ?? 0,
      rate: totalNum(d.rate) ?? 0,
      amount: totalNum(d.amount) ?? (totalNum(d.qty) ?? 0) * (totalNum(d.rate) ?? 0),
      levy: d.levyMode ?? "none",
    })),
    // computed outputs (server-recomputed)
    lossWt: numStr(e.lossWtKg),
    rmPerGm: numStr(e.rmPerGm),
    vaPerGm: numStr(e.vaPerGm),
    sinteredCostPerGm: numStr(e.sinteredCostPerGm),
    sinteredPricePerPiece: numStr(e.sinteredPricePerPiece),
    shapingCostPerPiece: numStr(e.shapingCostPerPiece),
    machiningCostPerPiece: numStr(e.machiningWithOverhead),
    costAfterMachining: numStr(e.costAfterMachining),
    negotiationAmount: numStr(e.negotiationAmount),
    finalCostPerPiece: numStr(totals.quoteInclPerPiece),
    quoteValue: numStr(totals.quoteInclValue),
    // terminal
    quantityToleranceId: terminal.quantityToleranceId,
    paymentTerms: terminal.paymentTerms,
    deliveryTime: terminal.deliveryTime,
    validity: terminal.validity,
    technicalNotes: terminal.technicalNotes,
    developmentNotes: terminal.developmentNotes,
    createdById: base.createdById,
  };
  return { row, finalPerPiece: totals.quoteInclPerPiece };
}

/** number | undefined | null → finite number | undefined. */
function totalNum(v: number | undefined | null): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** BO vendor quote rows (with a real cost) mapped to inserts (OH% → fraction). */
function buyoutQuoteRows(b: BuyoutInput) {
  return (b.vendors ?? [])
    .filter(
      (r) =>
        (typeof r.unitPrice === "number" && Number.isFinite(r.unitPrice)) ||
        Boolean(r.vendorId) ||
        Boolean((r.vendorName ?? "").trim()),
    )
    .map((r, i) => ({
      vendorId: uuidOrNull(r.vendorId ?? null),
      vendorNameSnapshot: (r.vendorName ?? "").trim() || null,
      // unitPrice is required by the column; blank rows contribute 0.
      unitPrice: String(totalNum(r.unitPrice) ?? 0),
      leadTimeDays: totalNum(r.leadTimeDays) ?? null,
      creditPeriodDays: totalNum(r.creditPeriodDays) ?? null,
      freightCost: null as string | null,
      // Buy-Out panel holds OH as a PERCENT (35 = 35%); store the FRACTION so
      // vendorLandedCost (unit + unit*OH) matches the panel's landed figure.
      vendorOhPct: fracStr(totalNum(r.vendorOhPct)),
      developmentCost: numStr(totalNum(r.developmentCost)),
      sortOrder: i,
      notes: (r.notes ?? "").trim() || null,
    }));
}

type SaveMasterResult =
  | {
      ok: true;
      inhouseId: string | null;
      boughtOutId: string | null;
      recommendedOption: CostingRoute | null;
      finalCostPerPiece: number;
    }
  | { ok: false; error: string };

export async function saveCostingMaster(
  input: SaveCostingMasterInput,
): Promise<SaveMasterResult> {
  const me = await requireUser();

  const parsed = SaveCostingMasterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // ── Integrity: the product line MUST belong to the gated inquiry ──
  const [ownItem] = await db
    .select({ inquiryId: inquiryItems.inquiryId })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, v.inquiryItemId))
    .limit(1);
  if (!ownItem) return { ok: false, error: "Product line not found." };
  if (ownItem.inquiryId !== v.inquiryId) {
    return { ok: false, error: "Product line does not belong to this enquiry." };
  }

  // ── Lock guard: a locked/approved chosen costing cannot be re-costed ──
  const [lockedRow] = await db
    .select({ id: costings.id })
    .from(costings)
    .where(
      and(
        eq(costings.inquiryItemId, v.inquiryItemId),
        eq(costings.isChosen, true),
        eq(costings.isLocked, true),
      ),
    )
    .limit(1);
  if (lockedRow) {
    return {
      ok: false,
      error: "This costing is approved and locked - unlock it to re-cost.",
    };
  }

  // ── Hard gate: this line's feasibility must be CONFIRMED (per-item) ──
  if (!(await isItemFeasibilityConfirmed(v.inquiryItemId))) {
    return {
      ok: false,
      error:
        "This product line's feasibility is not confirmed yet - confirm it in Primary Feasibility before costing.",
    };
  }

  const qty = totalNum(v.qty) ?? 0;
  const terminal: TerminalFields = {
    quantityToleranceId: uuidOrNull(v.quantityToleranceId ?? null),
    deliveryTime: (v.deliveryTime ?? "").trim() || null,
    validity: (v.validity ?? "").trim() || null,
    paymentTerms: (v.paymentTerms ?? "").trim() || null,
    technicalNotes: (v.technicalNotes ?? "").trim() || null,
    developmentNotes: (v.commercialNotes ?? "").trim() || null,
  };

  const wantInhouse = v.costingMode === "inhouse" || v.costingMode === "both";
  const wantBuyout = v.costingMode === "bought_out" || v.costingMode === "both";

  try {
    // Pre-compute both finals (to decide the cross-path recommendation for "both").
    const inhouseBuild =
      wantInhouse && v.inhouse
        ? buildInhouseRow(
            { inquiryItemId: v.inquiryItemId, inquiryId: v.inquiryId, createdById: me.id, isChosen: true },
            v.inhouse,
            qty,
            terminal,
          )
        : null;

    const boRows = wantBuyout && v.buyout ? buyoutQuoteRows(v.buyout) : [];
    // BO final = cheapest landed across the ranked quotes.
    let boFinal = 0;
    if (boRows.length > 0) {
      const cmp = compareVendors(
        boRows.map((r, i) => ({
          id: String(i),
          unitPrice: r.unitPrice,
          vendorOhPct: r.vendorOhPct,
          developmentCost: r.developmentCost,
          freightCost: r.freightCost,
          leadTimeDays: r.leadTimeDays,
          creditPeriodDays: r.creditPeriodDays,
        })),
        qty,
      );
      boFinal = cmp.cheapestId != null ? cmp.byId[cmp.cheapestId] ?? 0 : 0;
    }

    const inhouseFinal = inhouseBuild?.finalPerPiece ?? 0;

    // Cross-path recommendation. Only an AVAILABLE path (final > 0) can win; ties
    // and "no priced path" fall back to in-house. Only meaningful for "both".
    let recommendedOption: CostingRoute | null = null;
    if (v.costingMode === "both") {
      const inAvail = inhouseFinal > 0;
      const boAvail = boFinal > 0;
      if (inAvail && boAvail) {
        recommendedOption = inhouseFinal <= boFinal ? "inhouse" : "bought_out";
      } else if (boAvail) {
        recommendedOption = "bought_out";
      } else {
        recommendedOption = "inhouse";
      }
    } else if (v.costingMode === "inhouse") {
      recommendedOption = "inhouse";
    } else {
      recommendedOption = "bought_out";
    }

    const inhouseIsChosen =
      v.costingMode === "inhouse" ||
      (v.costingMode === "both" && recommendedOption === "inhouse");
    const boIsChosen =
      v.costingMode === "bought_out" ||
      (v.costingMode === "both" && recommendedOption === "bought_out");

    const result = await db.transaction(async (tx) => {
      // ── Write back the (possibly costing-revised) Product & Specifications ──
      // These are the LIVE inquiry_item spec columns the PF-vs-Costing variance
      // engine diffs against the frozen `feasibility_baseline` (never touched
      // here). Spec edits are allowed even when dimensions are locked — that is
      // the whole point (a costing may re-measure 36 → 36.5 and it is tracked as
      // variance); the lock only gates ENTRY to costing.
      if (v.revisedSpec) {
        const rs = v.revisedSpec;
        await tx
          .update(inquiryItems)
          .set({
            custProductName: textOrNull(rs.custProductName),
            custDrawingNo: textOrNull(rs.custDrawingNo),
            drawingRevisionNo: textOrNull(rs.drawingRevisionNo),
            quantityNos: numStr(totalNum(rs.quantityNos)),
            quantityUom: textOrNull(rs.quantityUom) ?? "Nos",
            shape: textOrNull(rs.shape),
            outerDia: numStr(totalNum(rs.outerDia)),
            innerDia: numStr(totalNum(rs.innerDia)),
            length: numStr(totalNum(rs.length)),
            width: numStr(totalNum(rs.width)),
            thickness: numStr(totalNum(rs.thickness)),
            dimensionUnit: textOrNull(rs.dimensionUnit) ?? "mm",
            dimensionNotes: textOrNull(rs.dimensionNotes),
            gradeCustomer: textOrNull(rs.gradeCustomer),
            gradeCustomerFacingId: uuidOrNull(rs.gradeCustomerFacingId),
            gradeInternalProductionId: uuidOrNull(rs.gradeInternalProductionId),
            toleranceId: uuidOrNull(rs.toleranceId),
            conditionId: uuidOrNull(rs.conditionId),
            internalProductionCodeId: uuidOrNull(rs.internalProductionCodeId),
            partNoId: uuidOrNull(rs.partNoId),
            updatedAt: new Date(),
          })
          .where(eq(inquiryItems.id, v.inquiryItemId));
      }

      // Exactly-one-chosen: clear every existing chosen costing for this item.
      await tx
        .update(costings)
        .set({ isChosen: false })
        .where(and(eq(costings.inquiryItemId, v.inquiryItemId), eq(costings.isChosen, true)));

      let inhouseId: string | null = null;
      let boughtOutId: string | null = null;

      // ── In-House row ──
      if (inhouseBuild) {
        const [row] = await tx
          .insert(costings)
          .values({
            ...inhouseBuild.row,
            isChosen: inhouseIsChosen,
            recommendedOption,
          })
          .returning({ id: costings.id });
        if (!row) throw new Error("inhouse-insert-failed");
        inhouseId = row.id;
      }

      // ── Bought-Out row (+ vendor quote matrix, server-ranked) ──
      if (wantBuyout && v.buyout) {
        const primary = boRows[0] ?? null;
        const [row] = await tx
          .insert(costings)
          .values({
            inquiryItemId: v.inquiryItemId,
            inquiryId: v.inquiryId,
            costingType: "bought_out",
            isChosen: boIsChosen,
            recommendedOption,
            qty: numStr(qty),
            outsourcedVendorCost: primary ? primary.unitPrice : null,
            vendorOhPct: primary ? primary.vendorOhPct : null,
            developmentCost: primary ? primary.developmentCost : null,
            vendorId: primary ? primary.vendorId : null,
            finalCostPerPiece: numStr(boFinal),
            quoteValue: numStr(boFinal * qty),
            // terminal
            quantityToleranceId: terminal.quantityToleranceId,
            paymentTerms: terminal.paymentTerms,
            deliveryTime: terminal.deliveryTime,
            validity: terminal.validity,
            technicalNotes: terminal.technicalNotes,
            developmentNotes: terminal.developmentNotes,
            createdById: me.id,
          })
          .returning({ id: costings.id });
        if (!row) throw new Error("bo-insert-failed");
        boughtOutId = row.id;

        if (boRows.length > 0) {
          const insertedQuotes = await tx
            .insert(costingVendorQuotes)
            .values(boRows.map((r) => ({ ...r, costingId: row.id })))
            .returning();
          // Server-rank; the cheapest landed cost is authoritative.
          const cmp = compareVendors(insertedQuotes, qty);
          const cheapestId = cmp.cheapestId;
          const cheapestLanded = cheapestId != null ? cmp.byId[cheapestId] ?? 0 : 0;
          await tx
            .update(costings)
            .set({
              recommendedVendorQuoteId: cheapestId,
              finalCostPerPiece: numStr(cheapestLanded),
              quoteValue: numStr(cheapestLanded * qty),
            })
            .where(eq(costings.id, row.id));
        }
      }

      return { inhouseId, boughtOutId };
    });

    revalidatePath("/costings");
    revalidatePath("/inquiries/" + v.inquiryId);
    // The spec write-back moves the live columns the variance report reads, so
    // refresh the Feasibility surface that mirrors the same VarianceReport.
    revalidatePath("/feasibility/" + v.inquiryId);
    revalidatePath("/enquiries/register/" + v.inquiryId);

    return {
      ok: true,
      inhouseId: result.inhouseId,
      boughtOutId: result.boughtOutId,
      recommendedOption,
      finalCostPerPiece: recommendedOption === "bought_out" ? boFinal : inhouseFinal,
    };
  } catch (err) {
    console.error("[saveCostingMaster]", err);
    return { ok: false, error: "Could not save the costing - please try again." };
  }
}
