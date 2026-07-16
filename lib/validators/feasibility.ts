import { z } from "zod";
import { RECHECK_STATES, FEAS_PRIORITIES, FEASIBILITY_STATUSES } from "@/db/enums";

/**
 * Primary-Feasibility validators (client-sheet model). The review is one record
 * per enquiry, stored on the `inquiries` row: five checks (Not Done / Yes /
 * Assumed, a note appears only on "Assumed") + Priority / Export / Actions List
 * / Feasibility Checked (person) / Feasibility Status. Mirrors the columns the
 * enquiry form already auto-fills; the feasibility screen edits only these.
 */

const OptionalText = (max = 2000) =>
  z.string().trim().max(max).transform((s) => (s === "" ? undefined : s)).optional();

const Check = z.enum(RECHECK_STATES).optional();

/** The engineer's "Save review" payload. */
export const SaveFeasibilityChecklistSchema = z
  .object({
    sizeDrawingCheck: Check,
    sizeDrawingNotes: OptionalText(1000),
    toleranceCheck: Check,
    toleranceNotes: OptionalText(1000),
    gradeAppCheck: Check,
    gradeAppNotes: OptionalText(1000),
    quantityCheck: Check,
    quantityNotes: OptionalText(1000),
    conditionCheck: Check,
    conditionNotes: OptionalText(1000),
    priority: z.enum(FEAS_PRIORITIES).optional(),
    export: z.boolean().optional(),
    actionsList: OptionalText(2000),
    feasibilityCheckedById: z.string().uuid().optional(),
    assignedSalesPersonId: z.string().uuid().optional(),
    status: z.enum(FEASIBILITY_STATUSES).optional(),
  })
  .strict();
export type SaveFeasibilityChecklistInput = z.infer<typeof SaveFeasibilityChecklistSchema>;

/** Bulk status set from the queue. */
export const SetFeasibilityStatusSchema = z.object({
  status: z.enum(FEASIBILITY_STATUSES),
});
