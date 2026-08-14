"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, negotiations, negotiationRemarks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { approvalRefusal } from "@/lib/approval/gate";
import {
  LOST_REASONS,
  NEGOTIATION_STAGE_BUCKETS,
  type NegotiationStatus,
} from "@/db/enums";

/**
 * Moving a deal on the Negotiation board.
 *
 * Two rules Manan set on 2026-08-13, both enforced here rather than in the UI:
 *
 *   1. EVERY move carries a remark. Not optional, not "add one later" — the
 *      thread is the record of the conversation, and a move with no remark is a
 *      gap nobody can reconstruct afterwards.
 *   2. LOST demands a reason from the fixed list, plus its own remarks. A lost
 *      deal with no reason teaches nobody anything, and by the time anyone asks,
 *      the person who lost it has moved on.
 *
 * Remarks are append-only in the database too (migration 0078), so a later bug
 * cannot quietly rewrite the history.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BoardMoveSchema = z
  .object({
    negotiationId: z.string().uuid("Invalid negotiation."),
    status: z.enum(NEGOTIATION_STAGE_BUCKETS),
    remark: z
      .string()
      .trim()
      .min(3, "A remark is required on every move.")
      .max(4000, "Remark is too long."),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostReasonRemarks: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.status !== "order_lost" || v.lostReason !== undefined, {
    message: "Pick a Lost Reason.",
    path: ["lostReason"],
  })
  .refine(
    (v) =>
      v.status !== "order_lost" ||
      v.lostReason !== "others" ||
      (v.lostReasonRemarks?.trim().length ?? 0) >= 3,
    {
      // "Others" with no explanation is the one combination that records
      // nothing at all.
      message: "Say what the other reason was.",
      path: ["lostReasonRemarks"],
    },
  );

export type BoardMoveInput = z.infer<typeof BoardMoveSchema>;

export async function moveNegotiation(
  input: BoardMoveInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = BoardMoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  // The board's columns are commercial outcomes, not the approval ladder — but
  // the gate still runs, so nobody reaches an approval bucket through here.
  const refusal = approvalRefusal({ status: v.status }, me);
  if (refusal) return { ok: false, error: refusal };

  const [current] = await db
    .select({ status: negotiations.negotiationStatus })
    .from(negotiations)
    .where(eq(negotiations.id, v.negotiationId))
    .limit(1);
  if (!current) return { ok: false, error: "Negotiation not found." };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(negotiations)
        .set({
          negotiationStatus: v.status,
          // Cleared when moving OFF Lost: a reason left behind on a deal that is
          // no longer lost would read as fact.
          lostReason: v.status === "order_lost" ? (v.lostReason ?? null) : null,
          lostReasonRemarks:
            v.status === "order_lost" ? (v.lostReasonRemarks?.trim() || null) : null,
          // A real move is real activity, so the ageing clock restarts.
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(negotiations.id, v.negotiationId));

      await tx.insert(negotiationRemarks).values({
        negotiationId: v.negotiationId,
        status: v.status,
        fromStatus: current.status,
        body: v.remark,
        authorId: me.id,
        createdAt: now,
      });
    });
  } catch (err) {
    console.error("[moveNegotiation]", err);
    return { ok: false, error: "Could not move the deal. Please try again." };
  }

  revalidatePath("/negotiations");
  revalidatePath("/negotiations/board");
  revalidatePath(`/negotiations/${v.negotiationId}`);
  return { ok: true };
}

const AddRemarkSchema = z.object({
  negotiationId: z.string().uuid("Invalid negotiation."),
  remark: z.string().trim().min(3, "Write a remark.").max(4000, "Remark is too long."),
});

/**
 * Add a remark WITHOUT moving the deal — the "I called them, no news" case.
 * Still counts as activity, so it resets the ageing clock; otherwise chasing a
 * customer weekly would leave the deal looking abandoned.
 */
export async function addNegotiationRemark(
  input: z.infer<typeof AddRemarkSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = AddRemarkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [current] = await db
    .select({ status: negotiations.negotiationStatus })
    .from(negotiations)
    .where(eq(negotiations.id, v.negotiationId))
    .limit(1);
  if (!current) return { ok: false, error: "Negotiation not found." };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(negotiationRemarks).values({
        negotiationId: v.negotiationId,
        status: current.status,
        fromStatus: null,
        body: v.remark,
        authorId: me.id,
        createdAt: now,
      });
      await tx
        .update(negotiations)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(negotiations.id, v.negotiationId));
    });
  } catch (err) {
    console.error("[addNegotiationRemark]", err);
    return { ok: false, error: "Could not save the remark. Please try again." };
  }

  revalidatePath("/negotiations");
  revalidatePath("/negotiations/board");
  revalidatePath(`/negotiations/${v.negotiationId}`);
  return { ok: true };
}

/** One entry in a deal's remark thread, as the panel renders it. */
export interface NegotiationRemarkEntry {
  id: string;
  body: string;
  /** The status the deal was in AFTER this remark. */
  status: NegotiationStatus;
  /** Where it came FROM, when the remark accompanied a move; null otherwise. */
  fromStatus: NegotiationStatus | null;
  authorName: string | null;
  createdAt: Date;
}

/**
 * The thread for one deal, NEWEST FIRST — "new remarks will keep coming on top
 * of old remarks" (Hetesh, 2026-08-13).
 *
 * Joined to the author here rather than returning a bare id: the panel exists to
 * be read, and "who said this" is half of what makes a remark worth reading.
 */
export async function listNegotiationRemarks(
  negotiationId: string,
): Promise<NegotiationRemarkEntry[]> {
  await requireUser();
  if (!UUID_RE.test(negotiationId)) return [];
  return db
    .select({
      id: negotiationRemarks.id,
      body: negotiationRemarks.body,
      status: negotiationRemarks.status,
      fromStatus: negotiationRemarks.fromStatus,
      authorName: employees.name,
      createdAt: negotiationRemarks.createdAt,
    })
    .from(negotiationRemarks)
    .leftJoin(employees, eq(negotiationRemarks.authorId, employees.id))
    .where(eq(negotiationRemarks.negotiationId, negotiationId))
    .orderBy(desc(negotiationRemarks.createdAt));
}
