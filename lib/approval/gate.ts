/**
 * The approval gate (Manan, 2026-08-13).
 *
 * Every sales stage now has a two-step finish: anyone doing the work can take a
 * record as far as **Done / Pending Approval**, and only an APPROVER can move it
 * to **Approved** or send it back as **Not Approved**. In this office that means
 * Alok (and Altus) — the admins.
 *
 * Pure and dependency-free so both the client board and the server action can
 * ask the same question, and so the rule is unit-testable without a database.
 *
 * The UI hides the two approver-only columns, but that is convenience only: the
 * authority is `assertApprovalAllowed`, called inside the server action, because
 * a hidden column is not a permission.
 */

import {
  APPROVER_ONLY_BUCKETS,
  APPROVER_ONLY_CHECK_STATES,
  type RecheckState,
} from "@/db/enums";

const APPROVER_CHECKS = new Set<string>(APPROVER_ONLY_CHECK_STATES);
const APPROVER_BUCKETS = new Set<string>(APPROVER_ONLY_BUCKETS);

/**
 * Who may approve. Today that is the admin flag — Alok and Altus are the two
 * admins, which is exactly the set Manan named.
 *
 * Kept as a named function rather than an inline `isAdmin` so that when the
 * permission catalogue is enforced (`<stage>.approve` already exists in it),
 * this is the ONE place that has to learn about it.
 */
export function canApprove(viewer: { isAdmin: boolean }): boolean {
  return viewer.isAdmin;
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
  viewer: { isAdmin: boolean },
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
  viewer: { isAdmin: boolean },
): string | null {
  if (canApprove(viewer)) return null;

  const badChecks = forbiddenCheckStates(input.checks ?? [], viewer);
  if (badChecks.length > 0) {
    return "Only an approver can mark a check Approved or Not Approved. Move it to Done and it will go for approval.";
  }
  if (input.status && isApproverBucket(statusBucketOf(input.status))) {
    return "Only an approver can approve or reject this stage.";
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
