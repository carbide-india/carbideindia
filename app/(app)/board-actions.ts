"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  inquiries,
  inquiryItems,
  costings,
  quotations,
  salesOrders,
  stageRemarks,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { approvalRefusal } from "@/lib/approval/gate";
import { BOARD_MODULES, isBoardBucket, type BoardModule } from "@/lib/board/registry";

/**
 * Move one record between columns on a stage board.
 *
 * One action for every stage rather than six near-identical ones, because the
 * differences are pure data (which table, which column) while the rules are
 * identical everywhere: the target must be a real column on that board, the
 * approval gate decides who may reach the approved/rejected ones, and a remark
 * is mandatory. Putting that in one place is what stops a future stage from
 * quietly shipping a board with no gate on it.
 *
 * The status write and the remark are ONE transaction. A move recorded with no
 * reason, or a reason recorded for a move that did not happen, would both be
 * worse than failing.
 */

type Result = { ok: true } | { ok: false; error: string };

const MoveSchema = z.object({
  module: z.enum([
    "enquiry",
    "feasibility",
    "secondary-feasibility",
    "costing",
    "quotation",
    "sales-order",
  ]),
  id: z.string().uuid("Invalid record."),
  toStatus: z.string().trim().min(1, "Pick a column."),
  // The whole point of the board: you cannot move work without saying why.
  remark: z
    .string()
    .trim()
    .min(3, "Say why this moved — a remark is required on every move.")
    .max(4000, "Remark is too long."),
});

export type BoardMoveInput = z.infer<typeof MoveSchema>;

/**
 * Which table, which status column, and how to write it, for one board.
 *
 * `set` is an explicit function per module rather than a computed key: Drizzle's
 * `.set()` takes TS PROPERTY names (`enquiryStatus`) while a column object's
 * `.name` is the DATABASE name (`enquiry_status`). Building the patch
 * dynamically from the column would typecheck and then write nothing at
 * runtime — the exact silent no-op the registers were shipping this morning.
 */
function target(module: BoardModule) {
  const now = () => new Date();
  switch (module) {
    case "enquiry":
      return {
        table: inquiries,
        col: inquiries.enquiryStatus,
        id: inquiries.id,
        set: (v: string) => ({ enquiryStatus: v as never, updatedAt: now() }),
      } as const;
    case "feasibility":
      return {
        table: inquiries,
        col: inquiries.feasibilityStatus,
        id: inquiries.id,
        set: (v: string) => ({ feasibilityStatus: v as never, updatedAt: now() }),
      } as const;
    case "secondary-feasibility":
      return {
        table: inquiryItems,
        col: inquiryItems.secondaryFeasibilityStatus,
        id: inquiryItems.id,
        set: (v: string) => ({ secondaryFeasibilityStatus: v as never, updatedAt: now() }),
      } as const;
    case "costing":
      return {
        table: costings,
        col: costings.costingDoneStatus,
        id: costings.id,
        set: (v: string) => ({ costingDoneStatus: v as never, updatedAt: now() }),
      } as const;
    case "quotation":
      return {
        table: quotations,
        col: quotations.quotationStatus,
        id: quotations.id,
        set: (v: string) => ({ quotationStatus: v as never, updatedAt: now() }),
      } as const;
    case "sales-order":
      return {
        table: salesOrders,
        col: salesOrders.salesOrderStatus,
        id: salesOrders.id,
        set: (v: string) => ({ salesOrderStatus: v as never, updatedAt: now() }),
      } as const;
  }
}

export async function moveOnBoard(input: BoardMoveInput): Promise<Result> {
  const me = await requireUser();

  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid move." };
  }
  const { module, id, toStatus, remark } = parsed.data;

  // The target must be a column on THIS board — not merely a value the enum
  // happens to allow, which is how a legacy status would sneak back in.
  if (!isBoardBucket(module, toStatus)) {
    return { ok: false, error: "That column doesn't exist on this board." };
  }

  // Same gate the registers use: only the approver may land a card in an
  // approved / not-approved column, whichever board it is.
  const refusal = approvalRefusal({ status: toStatus }, me);
  if (refusal) return { ok: false, error: refusal };

  const t = target(module);

  try {
    const moved = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: t.col })
        .from(t.table)
        .where(eq(t.id, id))
        .limit(1);
      if (!row) return null;

      const from = row.status as string | null;
      // A drop back onto the same column is a no-op, not an error — dnd fires
      // one on any imprecise drag, and recording it would junk the thread.
      if (from === toStatus) return { noop: true as const };

      const written = await tx
        .update(t.table)
        .set(t.set(toStatus))
        .where(eq(t.id, id))
        .returning({ id: t.id });
      // Never record a reason for a move that did not happen.
      if (written.length === 0) return null;

      await tx.insert(stageRemarks).values({
        module,
        recordId: id,
        fromStatus: from,
        toStatus,
        body: remark,
        authorId: me.id,
      });
      return { noop: false as const };
    });

    if (moved === null) return { ok: false, error: "That record no longer exists." };
  } catch (err) {
    console.error("[moveOnBoard] failed", { module, id, toStatus }, err);
    return { ok: false, error: "Could not move the card. Please try again." };
  }

  const cfg = BOARD_MODULES[module];
  revalidatePath(cfg.boardHref);
  revalidatePath(cfg.registerHref);
  return { ok: true };
}

/** The move history for one record, newest first — the "why" behind its path. */
export async function listStageRemarks(module: BoardModule, recordId: string) {
  await requireUser();
  if (!z.string().uuid().safeParse(recordId).success) return [];
  return db
    .select()
    .from(stageRemarks)
    .where(eq(stageRemarks.recordId, recordId))
    .orderBy(stageRemarks.createdAt);
}
