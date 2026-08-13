/**
 * The approval gate (Manan, 2026-08-13).
 *
 * Every sales stage now has a two-step finish: anyone doing the work can take a
 * record as far as **Done / Pending Approval**, and only an APPROVER can move it
 * to **Approved** or send it back as **Not Approved**. In this office that is
 * Alok, and only Alok — see `canApprove` for why that is its own flag rather
 * than the admin one.
 *
 * Pure and dependency-free so both the client board and the server action can
 * ask the same question, and so the rule is unit-testable without a database.
 *
 * The UI hides the two approver-only columns, but that is convenience only: the
 * authority is `approvalRefusal`, called inside the server action, because a
 * hidden column is not a permission.
 */

import {
  APPROVER_ONLY_BUCKETS,
  APPROVER_ONLY_CHECK_STATES,
  type RecheckState,
} from "@/db/enums";

const APPROVER_CHECKS = new Set<string>(APPROVER_ONLY_CHECK_STATES);
const APPROVER_BUCKETS = new Set<string>(APPROVER_ONLY_BUCKETS);

/** Anyone this gate is asked about. Only the approver flag matters. */
export interface Approver {
  isApprover: boolean;
}

/**
 * Who may approve.
 *
 * `is_approver`, NOT `is_admin`. Manan's instruction (2026-08-13) was that
 * signing work off is Alok's alone, and four people carry the admin flag —
 * Alok, Altus, Jeevan and Manan — so gating on `isAdmin` would have handed
 * approval to three people who were never meant to have it. The flag is seeded
 * for Alok in migration 0074 and granted per person in Admin → People.
 *
 * Deliberately independent of the permission-enforcement master switch: the
 * catalogue's `<stage>.approve` keys govern nothing until an admin turns
 * enforcement on, and approval must be restricted from the moment it ships.
 */
export function canApprove(viewer: Approver): boolean {
  return viewer.isApprover;
}

/** True for a per-check state only an approver may set. */
export function isApproverCheck(value: string): boolean {
  return APPROVER_CHECKS.has(value);
}

/** True for a stage bucket (record status) only an approver may set. */
export function isApproverBucket(status: string): boolean {
  return APPROVER_BUCKETS.has(status);
}

/**
 * Which of the supplied check values this viewer is not allowed to set.
 * Returns the offending values (de-duplicated) — empty when the save is fine.
 *
 * `undefined` entries are skipped: a partial save that simply doesn't mention a
 * check is not an attempt to approve it.
 */
export function forbiddenCheckStates(
  values: readonly (RecheckState | string | undefined | null)[],
  viewer: Approver,
): string[] {
  if (canApprove(viewer)) return [];
  const bad = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && isApproverCheck(v)) bad.add(v);
  }
  return [...bad];
}

/** Human-readable refusal, or null when the save may proceed. */
export function approvalRefusal(
  input: {
    /** Per-check states being written. */
    checks?: readonly (RecheckState | string | undefined | null)[];
    /** The record-level status being written. */
    status?: string | null;
  },
  viewer: Approver,
): string | null {
  if (canApprove(viewer)) return null;

  const badChecks = forbiddenCheckStates(input.checks ?? [], viewer);
  if (badChecks.length > 0) {
    return "Only the approver can mark a check Approved or Not Approved. Move it to Done and it will go for approval.";
  }
  if (input.status && isApproverBucket(statusBucketOf(input.status))) {
    return "Only the approver can approve or reject this stage.";
  }
  return null;
}

/**
 * Map a stage's own status value onto the house bucket it represents, so one
 * gate serves every stage despite each keeping its own enum.
 *
 * The final approved value is named after the stage (`costing_approved`,
 * `quotation_approved`, `proceed_to_costing`, …) — see the house-vocabulary note
 * in db/enums.ts — so approval is recognised by SUFFIX rather than by listing
 * all of them here and going stale the next time a stage is added.
 */
export function statusBucketOf(status: string): string {
  if (status === "not_approved") return "not_approved";
  if (status === "proceed_to_costing") return "approved"; // feasibility's legacy name
  if (status.endsWith("_approved")) return "approved";
  return status;
}
