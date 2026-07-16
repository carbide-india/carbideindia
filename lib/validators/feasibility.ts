import { z } from "zod";
import {
  FEAS_CHECK_VERDICTS,
  FEAS_RISKS,
  FEAS_PRIORITIES,
  FEASIBILITY_STATUSES,
} from "@/db/enums";

/**
 * Primary-Feasibility module validators. The review is saved as one SM-level
 * record (`inquiry_feasibility`) plus one row per product (`inquiry_item_
 * feasibility`). Engineer saves/submits; an admin approves or rejects.
 */

const OptionalText = (max = 2000) =>
  z.string().trim().max(max).transform((s) => (s === "" ? undefined : s)).optional();

const Verdict = z.enum(FEAS_CHECK_VERDICTS).optional();

/** One product line's DFM verdicts + notes. */
export const FeasibilityItemSchema = z.object({
  inquiryItemId: z.string().uuid(),
  // Original 5 checks.
  shapeDimVerdict: Verdict, shapeDimNote: OptionalText(1000),
  gradeVerdict: Verdict, gradeNote: OptionalText(1000),
  toleranceVerdict: Verdict, toleranceNote: OptionalText(1000),
  conditionVerdict: Verdict, conditionNote: OptionalText(1000),
  quantityVerdict: Verdict, quantityNote: OptionalText(1000),
  // Full DFM dimensions.
  drawingCompletenessVerdict: Verdict, drawingCompletenessNote: OptionalText(1000),
  toolingProcessVerdict: Verdict, toolingProcessNote: OptionalText(1000),
  materialSupplyVerdict: Verdict, materialSupplyNote: OptionalText(1000),
  surfaceFinishVerdict: Verdict, surfaceFinishNote: OptionalText(1000),
  specialProcessVerdict: Verdict, specialProcessNote: OptionalText(1000),
  // Rolled-up per-product verdict + risk.
  itemVerdict: Verdict,
  itemRiskRating: z.enum(FEAS_RISKS).optional(),
});
export type FeasibilityItemInput = z.input<typeof FeasibilityItemSchema>;

/** SM-level (commercial + rollup) fields. */
const FeasibilitySmSchema = z
  .object({
    priority: z.enum(FEAS_PRIORITIES).optional(),
    export: z.boolean().optional(),
    overallVerdict: Verdict,
    riskRating: z.enum(FEAS_RISKS).optional(),
    exportRegulatoryVerdict: Verdict, exportRegulatoryNote: OptionalText(1000),
    leadTimeVerdict: Verdict, leadTimeNote: OptionalText(1000),
    assumptions: OptionalText(2000),
    customerClarifications: OptionalText(2000),
    actionItems: OptionalText(2000),
    engineerId: z.string().uuid().optional(),
  })
  .strict();

/**
 * The engineer's "Save review" payload. `status` may advance to `in_review`
 * or `need_info` here; the approval-only statuses (`proceed_to_costing`,
 * `not_feasible`) are set exclusively through the approve/reject action.
 */
export const SaveFeasibilityReviewSchema = z
  .object({
    sm: FeasibilitySmSchema,
    status: z.enum(FEASIBILITY_STATUSES).optional(),
    products: z.array(FeasibilityItemSchema),
  })
  .strict();
export type SaveFeasibilityReviewInput = z.infer<typeof SaveFeasibilityReviewSchema>;

/**
 * v2 decision-scorecard SM-level (commercial + engineer) fields. Unlike the v1
 * `FeasibilitySmSchema`, the overall verdict/risk/score are NOT accepted from the
 * client — the server recomputes them from the dimension scores via the pure
 * engine (lib/feasibility/score.ts). Only inputs the engineer controls are here.
 */
const FeasibilityScorecardSmSchema = z
  .object({
    priority: z.enum(FEAS_PRIORITIES).optional(),
    export: z.boolean().optional(),
    exportRegulatoryVerdict: Verdict,
    exportRegulatoryNote: OptionalText(1000),
    leadTimeVerdict: Verdict,
    leadTimeNote: OptionalText(1000),
    assumptions: OptionalText(2000),
    customerClarifications: OptionalText(2000),
    actionItems: OptionalText(2000),
    engineerId: z.string().uuid().optional(),
  })
  .strict();

/** One dimension's engineer input on the scorecard (score 0–100 or null). */
export const FeasibilityScoreSchema = z
  .object({
    dimensionKey: z.string().min(1),
    score: z.number().int().min(0).max(100).nullable().optional(),
    risk: z.enum(FEAS_RISKS).optional(),
    isCritical: z.boolean().default(false),
    note: OptionalText(1000),
  })
  .strict();
export type FeasibilityScoreInput = z.input<typeof FeasibilityScoreSchema>;

/**
 * The engineer's "Save scorecard" payload (v2). `status` may advance to
 * `in_review` / `need_info`; approval-only statuses (`proceed_to_costing`,
 * `not_feasible`) are set exclusively through the approve/reject action. The
 * server recomputes index/verdict/risk/blockers from `scores`.
 */
export const SaveFeasibilityScorecardSchema = z
  .object({
    sm: FeasibilityScorecardSmSchema,
    status: z.enum(FEASIBILITY_STATUSES).optional(),
    scores: z.array(FeasibilityScoreSchema),
  })
  .strict();
export type SaveFeasibilityScorecardInput = z.input<typeof SaveFeasibilityScorecardSchema>;
export type SaveFeasibilityScorecard = z.infer<typeof SaveFeasibilityScorecardSchema>;

/** Engineer submits the completed review for admin approval. */
export const SubmitFeasibilitySchema = z
  .object({ note: OptionalText(2000) })
  .strict();

/** Admin approve/reject decision (approve → proceed_to_costing, reject → not_feasible). */
export const ApproveFeasibilitySchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: OptionalText(2000),
  })
  .strict();
export type ApproveFeasibilityInput = z.infer<typeof ApproveFeasibilitySchema>;

/** Bulk status set from the queue (active statuses only enforced in the action). */
export const SetFeasibilityStatusSchema = z.object({
  status: z.enum(FEASIBILITY_STATUSES),
});
