"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inquiries,
  inquiryItems,
  inquiryItemFeasibility,
  inquiryFeasibility,
  feasibilityDimensions,
  inquiryFeasibilityScores,
} from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import type { DbOrTx } from "@/lib/item-master/sync";
import type { FeasibilityStatus } from "@/db/enums";
import {
  computeFeasibility,
  verdictForScore,
  isVerdictCostable,
  type DimensionScore,
  type FeasibilityScoreResult,
} from "@/lib/feasibility/score";
import { FEASIBILITY_DIMENSIONS } from "@/lib/feasibility/dimensions";
import {
  SaveFeasibilityReviewSchema,
  SaveFeasibilityScorecardSchema,
  SubmitFeasibilitySchema,
  ApproveFeasibilitySchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/feasibility";

/**
 * Primary-Feasibility module write path. The review lives in the SM-level
 * `inquiry_feasibility` record (one per enquiry, upserted on the unique
 * inquiry_id). v2 stores the engineer's per-dimension scores in
 * `inquiry_feasibility_scores`; the overall index / verdict / risk / blockers
 * are ALWAYS server-recomputed from those scores via the pure engine
 * (lib/feasibility/score.ts) — never trusted from the client. Engineers save
 * and submit; only an admin can approve (→ proceed_to_costing) or reject
 * (→ not_feasible), which is what unlocks / blocks costing.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

/** Statuses an engineer may set directly (approval outcomes are admin-only). */
const ENGINEER_STATUSES: readonly FeasibilityStatus[] = ["not_started", "in_review", "need_info"];
/** Statuses allowed via the queue's bulk control (never the approval outcomes). */
const BULK_STATUSES: readonly FeasibilityStatus[] = ["not_started", "in_review", "need_info", "pending_approval"];

function revalidateFeasibility(inquiryId: string) {
  revalidatePath("/feasibility");
  revalidatePath(`/feasibility/${inquiryId}`);
  revalidatePath("/enquiries/register/[id]", "page");
  revalidatePath("/inquiries/[id]", "page");
}

/** Ensure a feasibility row exists for the inquiry; returns nothing. */
async function ensureReviewRow(tx: DbOrTx, inquiryId: string, engineerId: string) {
  await tx
    .insert(inquiryFeasibility)
    .values({ inquiryId, engineerId })
    .onConflictDoNothing({ target: inquiryFeasibility.inquiryId });
}

/**
 * The active dimension weights (admin master, ordered by sort). Falls back to
 * the built-in defaults when the master has not been seeded, so scoring always
 * has weights to snapshot.
 */
async function activeDimensionWeights(tx: DbOrTx): Promise<{ key: string; weight: number }[]> {
  const rows = await tx
    .select({
      key: feasibilityDimensions.key,
      weight: feasibilityDimensions.weight,
      sortOrder: feasibilityDimensions.sortOrder,
    })
    .from(feasibilityDimensions)
    .where(eq(feasibilityDimensions.isActive, true))
    .orderBy(feasibilityDimensions.sortOrder);
  if (rows.length === 0) {
    return FEASIBILITY_DIMENSIONS.map((d) => ({ key: d.key, weight: d.defaultWeight }));
  }
  return rows.map((r) => ({ key: r.key, weight: Number(r.weight) }));
}

/**
 * Authoritative recompute: read the active dimensions + the saved score rows
 * for one enquiry and roll them up through the pure engine. Used both after a
 * scorecard save and before submit (the submit gate reads `hasUnscored`).
 */
async function computeStoredFeasibility(
  tx: DbOrTx,
  inquiryId: string,
): Promise<FeasibilityScoreResult> {
  const dims = await activeDimensionWeights(tx);
  const scoreRows = await tx
    .select()
    .from(inquiryFeasibilityScores)
    .where(eq(inquiryFeasibilityScores.inquiryId, inquiryId));
  const byKey = new Map(scoreRows.map((r) => [r.dimensionKey, r]));
  const list: DimensionScore[] = dims.map((d) => {
    const row = byKey.get(d.key);
    return {
      key: d.key,
      weight: row ? Number(row.weightSnapshot) : d.weight,
      score: row?.score ?? null,
      risk: row?.risk ?? null,
      isCritical: row?.isCritical ?? false,
    };
  });
  return computeFeasibility(list);
}

/**
 * v2 engineer save: SM-level fields + per-dimension scores. Persists each score
 * row (with a frozen weight snapshot + derived band verdict) then recomputes the
 * SM roll-up (index / verdict / risk / blockers) server-side and writes it back.
 */
export async function saveFeasibilityScorecard(
  inquiryId: string,
  input: unknown,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(inquiryId)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SaveFeasibilityScorecardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid feasibility data." };
  const { sm, status, scores } = parsed.data;
  if (status !== undefined && !ENGINEER_STATUSES.includes(status)) {
    return { ok: false, error: "Approval is done from the Approval bar, not here." };
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Upsert the SM-level record (engineer-controlled fields + status). The
      //    overall roll-up columns are written in step 3 after recompute.
      await tx
        .insert(inquiryFeasibility)
        .values({
          inquiryId,
          status: status ?? "in_review",
          priority: sm.priority,
          export: sm.export,
          exportRegulatoryVerdict: sm.exportRegulatoryVerdict,
          exportRegulatoryNote: sm.exportRegulatoryNote,
          leadTimeVerdict: sm.leadTimeVerdict,
          leadTimeNote: sm.leadTimeNote,
          assumptions: sm.assumptions,
          customerClarifications: sm.customerClarifications,
          actionItems: sm.actionItems,
          engineerId: sm.engineerId ?? me.id,
        })
        .onConflictDoUpdate({
          target: inquiryFeasibility.inquiryId,
          set: {
            ...(status !== undefined ? { status } : {}),
            priority: sm.priority,
            export: sm.export,
            exportRegulatoryVerdict: sm.exportRegulatoryVerdict,
            exportRegulatoryNote: sm.exportRegulatoryNote,
            leadTimeVerdict: sm.leadTimeVerdict,
            leadTimeNote: sm.leadTimeNote,
            assumptions: sm.assumptions,
            customerClarifications: sm.customerClarifications,
            actionItems: sm.actionItems,
            ...(sm.engineerId !== undefined ? { engineerId: sm.engineerId } : {}),
            updatedAt: new Date(),
          },
        });

      // 2. Upsert each dimension score. weightSnapshot freezes the master weight
      //    at scoring time; verdict is the derived band (never client-sent).
      const weightByKey = new Map(
        (await activeDimensionWeights(tx)).map((d) => [d.key, d.weight]),
      );
      for (const s of scores) {
        const scoreVal = s.score ?? null;
        const weightSnapshot = String(weightByKey.get(s.dimensionKey) ?? 0);
        await tx
          .insert(inquiryFeasibilityScores)
          .values({
            inquiryId,
            dimensionKey: s.dimensionKey,
            weightSnapshot,
            score: scoreVal,
            risk: s.risk,
            isCritical: s.isCritical,
            verdict: verdictForScore(scoreVal),
            note: s.note,
          })
          .onConflictDoUpdate({
            target: [inquiryFeasibilityScores.inquiryId, inquiryFeasibilityScores.dimensionKey],
            set: {
              weightSnapshot,
              score: scoreVal,
              risk: s.risk ?? null,
              isCritical: s.isCritical,
              verdict: verdictForScore(scoreVal),
              note: s.note ?? null,
              updatedAt: new Date(),
            },
          });
      }

      // 3. Recompute the roll-up from the just-saved scores and write it back.
      const result = await computeStoredFeasibility(tx, inquiryId);
      await tx
        .update(inquiryFeasibility)
        .set({
          overallScore: String(result.index),
          overallVerdict: result.overallVerdict,
          riskRating: result.overallRisk,
          blockerCount: result.blockerCount,
          updatedAt: new Date(),
        })
        .where(eq(inquiryFeasibility.inquiryId, inquiryId));
    });
  } catch (err) {
    console.error("[saveFeasibilityScorecard] failed", err);
    return { ok: false, error: "Could not save the feasibility. Please try again." };
  }
  revalidateFeasibility(inquiryId);
  return { ok: true };
}

/**
 * v1 engineer save: SM-level fields + per-product DFM verdicts. Retained for the
 * legacy per-product checklist workspace until the v2 scorecard replaces it.
 */
export async function saveFeasibilityReview(
  inquiryId: string,
  input: unknown,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(inquiryId)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SaveFeasibilityReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid feasibility data." };
  const { sm, status, products } = parsed.data;
  if (status !== undefined && !ENGINEER_STATUSES.includes(status)) {
    return { ok: false, error: "Approval is done from the Approval bar, not here." };
  }

  try {
    await db.transaction(async (tx) => {
      // Upsert the SM-level record. engineerId defaults to the current user on
      // first insert; on update it only changes when explicitly provided.
      await tx
        .insert(inquiryFeasibility)
        .values({
          inquiryId,
          status: status ?? "in_review",
          priority: sm.priority,
          export: sm.export,
          overallVerdict: sm.overallVerdict,
          riskRating: sm.riskRating,
          exportRegulatoryVerdict: sm.exportRegulatoryVerdict,
          exportRegulatoryNote: sm.exportRegulatoryNote,
          leadTimeVerdict: sm.leadTimeVerdict,
          leadTimeNote: sm.leadTimeNote,
          assumptions: sm.assumptions,
          customerClarifications: sm.customerClarifications,
          actionItems: sm.actionItems,
          engineerId: sm.engineerId ?? me.id,
        })
        .onConflictDoUpdate({
          target: inquiryFeasibility.inquiryId,
          set: {
            ...(status !== undefined ? { status } : {}),
            priority: sm.priority,
            export: sm.export,
            overallVerdict: sm.overallVerdict,
            riskRating: sm.riskRating,
            exportRegulatoryVerdict: sm.exportRegulatoryVerdict,
            exportRegulatoryNote: sm.exportRegulatoryNote,
            leadTimeVerdict: sm.leadTimeVerdict,
            leadTimeNote: sm.leadTimeNote,
            assumptions: sm.assumptions,
            customerClarifications: sm.customerClarifications,
            actionItems: sm.actionItems,
            ...(sm.engineerId !== undefined ? { engineerId: sm.engineerId } : {}),
            updatedAt: new Date(),
          },
        });

      // Verify each product line belongs to this inquiry, then upsert its row.
      const ownItems = await tx
        .select({ id: inquiryItems.id })
        .from(inquiryItems)
        .where(eq(inquiryItems.inquiryId, inquiryId));
      const ownIds = new Set(ownItems.map((r) => r.id));
      for (const p of products) {
        if (!ownIds.has(p.inquiryItemId)) {
          throw new Error(`inquiry_item ${p.inquiryItemId} does not belong to inquiry ${inquiryId}`);
        }
      }
      for (const p of products) {
        const { inquiryItemId, ...rest } = p;
        await tx
          .insert(inquiryItemFeasibility)
          .values({ inquiryItemId, ...rest })
          .onConflictDoUpdate({
            target: inquiryItemFeasibility.inquiryItemId,
            set: { ...rest, updatedAt: new Date() },
          });
      }
    });
  } catch (err) {
    console.error("[saveFeasibilityReview] failed", err);
    return { ok: false, error: "Could not save the feasibility. Please try again." };
  }
  revalidateFeasibility(inquiryId);
  return { ok: true };
}

/** Engineer submits the review for admin approval. */
export async function submitFeasibilityForApproval(
  inquiryId: string,
  input: unknown,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(inquiryId)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = SubmitFeasibilitySchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Invalid submission." };
  try {
    // Gate: every active dimension must be scored (no Needs-info roll-up) before
    // it can go to an admin. Recompute from the stored scores authoritatively.
    const result = await computeStoredFeasibility(db, inquiryId);
    if (result.hasUnscored || result.overallVerdict === "need_info") {
      return {
        ok: false,
        error: "Score every feasibility dimension before submitting for approval.",
      };
    }
    await db.transaction(async (tx) => {
      await ensureReviewRow(tx, inquiryId, me.id);
      await tx
        .update(inquiryFeasibility)
        .set({
          status: "pending_approval",
          engineerId: me.id,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inquiryFeasibility.inquiryId, inquiryId));
    });
  } catch (err) {
    console.error("[submitFeasibilityForApproval] failed", err);
    return { ok: false, error: "Could not submit for approval. Please try again." };
  }
  revalidateFeasibility(inquiryId);
  return { ok: true };
}

/** Admin approves (→ proceed_to_costing) or rejects (→ not_feasible). */
export async function approveFeasibility(
  inquiryId: string,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!isUuid(inquiryId)) return { ok: false, error: "Invalid inquiry id." };
  const parsed = ApproveFeasibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid approval decision." };
  const { decision, note } = parsed.data;

  try {
    const [row] = await db
      .select({ overallVerdict: inquiryFeasibility.overallVerdict })
      .from(inquiryFeasibility)
      .where(eq(inquiryFeasibility.inquiryId, inquiryId))
      .limit(1);
    if (!row) {
      return { ok: false, error: "No feasibility review to approve — submit it first." };
    }
    // A Not-feasible / Needs-info roll-up can be rejected but never approved.
    if (decision === "approve" && !isVerdictCostable(row.overallVerdict)) {
      return { ok: false, error: "Not-feasible reviews cannot be approved." };
    }
    const nextStatus: FeasibilityStatus =
      decision === "approve" ? "proceed_to_costing" : "not_feasible";
    await db
      .update(inquiryFeasibility)
      .set({
        status: nextStatus,
        approverId: admin.id,
        approvedAt: new Date(),
        approvalNote: note,
        updatedAt: new Date(),
      })
      .where(eq(inquiryFeasibility.inquiryId, inquiryId));
  } catch (err) {
    console.error("[approveFeasibility] failed", err);
    return { ok: false, error: "Could not record the decision. Please try again." };
  }
  revalidateFeasibility(inquiryId);
  return { ok: true };
}

/** Queue bulk status (engineer statuses only — approval outcomes are excluded). */
export async function setFeasibilityStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid)) {
    return { ok: false, error: "Invalid selection." };
  }
  const parsed = SetFeasibilityStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const next = parsed.data.status;
  if (!BULK_STATUSES.includes(next)) {
    return { ok: false, error: "Approve or reject from a review, not the bulk control." };
  }
  try {
    await db.transaction(async (tx) => {
      for (const inquiryId of ids) {
        await tx
          .insert(inquiryFeasibility)
          .values({ inquiryId, status: next, engineerId: me.id })
          .onConflictDoUpdate({
            target: inquiryFeasibility.inquiryId,
            set: { status: next, updatedAt: new Date() },
          });
      }
    });
  } catch (err) {
    console.error("[setFeasibilityStatusBulk] failed", err);
    return { ok: false, error: "Could not update the selection. Please try again." };
  }
  revalidatePath("/feasibility");
  return { ok: true };
}
