/**
 * Stage derivation (ERP redesign — Phase 3, HARDENED in Phase 8).
 *
 * This module is the SOLE AUTHORITY for pipeline state (Canonical Decisions §):
 * the two distinctly-named public entry points are `itemFurthestStage` (the max
 * stage across an Item's where-used — for the Item lifecycle stepper) and
 * `smRollupStage` (the least-advanced active line — for the SM stepper). Every
 * screen imports these; NO screen computes its own stage. The lower-level
 * `deriveItemStage` / `deriveSmStage` remain the stable, unit-tested cores these
 * two wrap.
 *
 * Pure + dependency-free (no DB, no server-only) so it is trivially
 * unit-testable and safe to import from client OR server (the `Stepper` reads
 * its stage constants/labels; server pages call the derive helpers with cheap
 * counts).
 */

/**
 * The canonical pipeline, in order. Index === stage number (0-based). This is
 * the single source the `Stepper` and every stage-derivation consumer read from.
 */
export const PIPELINE_STAGES = [
  "enquiry",
  "feasibility",
  "costing",
  "quotation",
  "negotiation",
  "sales_order",
  "job_card",
  "production",
  "dispatch",
  "invoice",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Human labels for the stepper nodes. */
export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  enquiry: "Enquiry",
  feasibility: "Feasibility",
  costing: "Costing",
  quotation: "Quotation",
  negotiation: "Negotiation",
  sales_order: "Sales Order",
  job_card: "Job Card",
  production: "Production",
  dispatch: "Dispatch",
  invoice: "Invoice",
};

/** Index (0-based) of a stage in {@link PIPELINE_STAGES}. */
export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

/**
 * Signals available about an Item's reach across the pipeline. Every field is
 * optional so callers can pass only what they cheaply have. Counts express "at
 * least one referencing row exists at this stage or beyond"; booleans are direct
 * "reached" flags. Phase 8 swaps this for the real per-line furthest-stage roll.
 */
export interface ItemStageSignals {
  /** The item's own lifecycle status. `draft` clamps the stage to Enquiry. */
  status?: "draft" | "active" | "archived" | "superseded";
  /** Referencing enquiry lines (the item always originates from ≥1 enquiry). */
  inquiryCount?: number;
  /** Referencing / linked costing rows. */
  costingCount?: number;
  /** Referencing quotation lines. */
  quotationCount?: number;
  /** Referencing negotiation lines. */
  negotiationCount?: number;
  /** Referencing sales-order lines. */
  salesOrderCount?: number;
  /** Referencing job cards. */
  jobCardCount?: number;
}

/**
 * Derive the furthest pipeline stage an Item has reached, as a 0-based index
 * into {@link PIPELINE_STAGES}. FIRST-CUT: walks the stages in order and takes
 * the highest one with a positive signal. A `draft` item is clamped to Enquiry
 * (index 0) because its spec is not yet complete enough to advance.
 *
 * Returns `0` (Enquiry) as the floor — an item always came from an enquiry.
 */
export function deriveItemStage(signals: ItemStageSignals): number {
  if (signals.status === "draft") return stageIndex("enquiry");

  // Ordered [stage, reached?] — later entries win when truthy.
  const reached: ReadonlyArray<readonly [PipelineStage, boolean]> = [
    ["enquiry", (signals.inquiryCount ?? 0) > 0],
    ["feasibility", (signals.costingCount ?? 0) > 0],
    ["costing", (signals.costingCount ?? 0) > 0],
    ["quotation", (signals.quotationCount ?? 0) > 0],
    ["negotiation", (signals.negotiationCount ?? 0) > 0],
    ["sales_order", (signals.salesOrderCount ?? 0) > 0],
    ["job_card", (signals.jobCardCount ?? 0) > 0],
  ];

  let furthest = stageIndex("enquiry");
  for (const [stage, isReached] of reached) {
    if (isReached) furthest = Math.max(furthest, stageIndex(stage));
  }
  return furthest;
}

/**
 * Signals available about an SM/enquiry's roll-up stage. FIRST-CUT: maps the
 * enquiry status string onto a stage. Unknown statuses fall back to Enquiry.
 * Phase 8 replaces this with the real `smRollupStage` over all child lines.
 */
export interface SmStageSignals {
  enquiryStatus?: string | null;
  hasCosting?: boolean;
  hasQuotation?: boolean;
  hasNegotiation?: boolean;
  hasSalesOrder?: boolean;
  hasJobCard?: boolean;
}

/**
 * Derive an SM's furthest stage index. FIRST-CUT: the boolean "has X" flags win
 * over the status string; when only a status string is present a small keyword
 * map is used. Floor is Enquiry.
 */
export function deriveSmStage(signals: SmStageSignals): number {
  const flagged: ReadonlyArray<readonly [PipelineStage, boolean | undefined]> = [
    ["costing", signals.hasCosting],
    ["quotation", signals.hasQuotation],
    ["negotiation", signals.hasNegotiation],
    ["sales_order", signals.hasSalesOrder],
    ["job_card", signals.hasJobCard],
  ];

  let furthest = stageIndex("enquiry");
  for (const [stage, isReached] of flagged) {
    if (isReached) furthest = Math.max(furthest, stageIndex(stage));
  }

  // If no flags fired, fall back to a keyword read of the status string.
  if (furthest === stageIndex("enquiry") && signals.enquiryStatus) {
    const s = signals.enquiryStatus.toLowerCase();
    if (s.includes("order") || s.includes("won") || s.includes("po")) {
      furthest = stageIndex("sales_order");
    } else if (s.includes("negotia")) {
      furthest = stageIndex("negotiation");
    } else if (s.includes("quot")) {
      furthest = stageIndex("quotation");
    } else if (s.includes("cost")) {
      furthest = stageIndex("costing");
    } else if (s.includes("feas")) {
      furthest = stageIndex("feasibility");
    }
  }

  return furthest;
}

// ── Phase 8 — the two SOLE AUTHORITIES (distinctly named per §4.6) ───────────

/** A resolved stage plus its index, the shape every stepper consumes. */
export interface ResolvedStage {
  stage: PipelineStage;
  index: number;
}

function resolve(index: number): ResolvedStage {
  const clamped = Math.min(Math.max(index, 0), PIPELINE_STAGES.length - 1);
  const stage = PIPELINE_STAGES[clamped] ?? "enquiry";
  return { stage, index: clamped };
}

/**
 * The FURTHEST stage any line referencing an Item has reached — the Item's
 * lifecycle position (fan-out over where-used). Wraps {@link deriveItemStage};
 * this is the ONE function the Item lifecycle stepper reads (§4.6). Returns the
 * resolved stage + its index so callers never re-map.
 */
export function itemFurthestStage(signals: ItemStageSignals): ResolvedStage {
  return resolve(deriveItemStage(signals));
}

/**
 * The SM roll-up stage — the least-advanced active line drives the SM stepper.
 * When per-line signals are available, pass the per-line furthest indices in
 * `lineStages`; the roll-up is their MINIMUM (a multi-product SM is only as far
 * as its laggard line, §4.1). With no per-line detail it falls back to the
 * SM-level {@link deriveSmStage} over the header signals. This is the ONE
 * function every SM stepper reads.
 */
export function smRollupStage(
  signals: SmStageSignals & { lineStages?: ReadonlyArray<number> },
): ResolvedStage {
  if (signals.lineStages && signals.lineStages.length > 0) {
    const min = signals.lineStages.reduce(
      (m, s) => Math.min(m, s),
      PIPELINE_STAGES.length - 1,
    );
    return resolve(min);
  }
  return resolve(deriveSmStage(signals));
}
