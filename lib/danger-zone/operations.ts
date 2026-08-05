/**
 * Danger Zone operation catalogue - the single source of truth for what each
 * destructive maintenance operation does, what it destroys, and the exact
 * phrase an admin must type to run it.
 *
 * Deliberately free of DB / server-only imports so BOTH the client console
 * (which renders the copy and gates the run button) and the server actions
 * (which re-validate the typed phrase against a hostile client) read the same
 * strings. A phrase can never drift between the dialog and the guard.
 */

/** Inclusive bounds for every retention-window input. */
export const DANGER_ZONE_WINDOW_MIN = 0;
export const DANGER_ZONE_WINDOW_MAX = 3650;

/** Retention windows (in days) the page opens with. */
export const DANGER_ZONE_DEFAULT_WINDOWS = {
  /** Recycled drafts auto-purge at 48h anyway - 2 days matches that contract. */
  recycledDraftDays: 2,
  readNotificationDays: 90,
  stalePushDeviceDays: 90,
} as const;

export interface DangerZoneWindows {
  recycledDraftDays: number;
  readNotificationDays: number;
  stalePushDeviceDays: number;
}

/** Clamp + integer-ise a window from any source (URL, hostile client, typo). */
export function clampWindow(days: unknown): number {
  const raw = typeof days === "number" ? days : Number(days);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.trunc(raw), DANGER_ZONE_WINDOW_MIN), DANGER_ZONE_WINDOW_MAX);
}

export type DangerZoneOperationKey =
  | "purge_recycled_drafts"
  | "prune_read_notifications"
  | "prune_stale_devices"
  | "rebuild_derived_data"
  | "clear_caches"
  | "revoke_employee_access";

export interface DangerZoneOperationMeta {
  key: DangerZoneOperationKey;
  /**
   * Stable uuid this operation's rows carry in `audit_log.entity_id`
   * (the column is a NOT NULL uuid and a maintenance run has no entity of its
   * own). Fixed constants, so every run of one operation groups together.
   */
  auditEntityId: string;
  title: string;
  /** One line: what the operation is for. */
  summary: string;
  /** Plain-language blast radius, one bullet per consequence. */
  blastRadius: string[];
  /** What survives - the reassurance half of the blast radius. */
  protected: string[];
  /** Can this be undone, and how. Rendered verbatim in the dialog. */
  reversibility: string;
  /**
   * "phrase" - type this exact string; "email" - type the target's email;
   * "none" - a plain confirm (used only where nothing is destroyed).
   */
  confirmKind: "phrase" | "email" | "none";
  /** The literal string for confirmKind === "phrase". */
  confirmPhrase: string | null;
  runLabel: string;
  tone: "red" | "amber" | "blue";
}

export const DANGER_ZONE_OPERATIONS: Record<
  DangerZoneOperationKey,
  DangerZoneOperationMeta
> = {
  purge_recycled_drafts: {
    key: "purge_recycled_drafts",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1101",
    title: "Purge recycled form drafts",
    summary:
      "Permanently destroy auto-saved form drafts already sitting in a Recycle Bin, for every user, older than the chosen window.",
    blastRadius: [
      "Deletes rows from form_drafts where the draft is already recycled (deleted_at set) and older than the window.",
      "Runs across EVERY user's Recycle Bin, not just yours.",
      "The draft payload - the half-typed KYC / Sample / Costing / Quotation form - is gone for good.",
    ],
    protected: [
      "Active drafts (still in a Drafts list) are never matched - only recycled ones.",
      "No submitted record is touched: a draft is pre-submission form state, not a business record.",
    ],
    reversibility:
      "Irreversible. These drafts already auto-purge 48 hours after being recycled; this only does it now.",
    confirmKind: "phrase",
    confirmPhrase: "PURGE DRAFTS",
    runLabel: "Purge drafts",
    tone: "red",
  },
  prune_read_notifications: {
    key: "prune_read_notifications",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1102",
    title: "Prune read notifications",
    summary:
      "Delete already-read in-app notifications older than the chosen window, plus their delivery-attempt log rows.",
    blastRadius: [
      "Deletes rows from notifications where read_at is set and created_at is older than the window.",
      "notification_dispatch_log rows for those notifications cascade away with them.",
      "Everyone's inbox history is trimmed, not just yours.",
    ],
    protected: [
      "Unread notifications are never deleted, at any age.",
      "Tasks, task events and the audit log are untouched - a notification is only a delivery record.",
    ],
    reversibility: "Irreversible. Notification rows are not soft-deleted.",
    confirmKind: "phrase",
    confirmPhrase: "PRUNE NOTIFICATIONS",
    runLabel: "Prune notifications",
    tone: "red",
  },
  prune_stale_devices: {
    key: "prune_stale_devices",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1103",
    title: "Prune stale push devices",
    summary:
      "Remove web-push subscriptions from browsers that have not checked in inside the chosen window, so failed pushes stop.",
    blastRadius: [
      "Deletes rows from push_subscriptions whose last_seen_at is older than the window.",
      "Those browsers stop receiving push notifications until the person opens the app again.",
    ],
    protected: [
      "Email delivery and in-app notifications are unaffected.",
      "No account is disabled - a device token is not a session.",
    ],
    reversibility:
      "Self-healing: the browser re-registers automatically on the person's next visit with notifications enabled.",
    confirmKind: "phrase",
    confirmPhrase: "PRUNE DEVICES",
    runLabel: "Prune devices",
    tone: "amber",
  },
  revoke_employee_access: {
    key: "revoke_employee_access",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1104",
    title: "Deactivate an employee and revoke access",
    summary:
      "One step: deactivate the employee row, disable their sign-in account, kill their live sessions and drop their device registrations.",
    blastRadius: [
      "Sets employees.is_active = false - every page immediately bounces them to /login.",
      "Disables their Firebase account, so a new sign-in (and any pending invite link) is refused.",
      "Marks every un-revoked login_sessions row for them as revoked, stamped with your name.",
      "Deletes their push_subscriptions rows so devices stop receiving notifications.",
    ],
    protected: [
      "The employee row itself is kept - governance is deactivate-only, never hard-delete.",
      "Their tasks, comments and audit history stay exactly as they are.",
    ],
    reversibility:
      "Reversible: Employees → Reactivate restores the row and re-enables the sign-in account.",
    confirmKind: "email",
    confirmPhrase: null,
    runLabel: "Revoke access",
    tone: "red",
  },
  rebuild_derived_data: {
    key: "rebuild_derived_data",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1105",
    title: "Rebuild department mirrors",
    summary:
      "Repair drift between the departments table, the legacy employees.department text mirror and the membership join.",
    blastRadius: [
      "Re-links employees whose legacy department text matches a department by name but carry no department_id.",
      "Rewrites employees.department to the linked department's current name.",
      "Inserts the missing primary employee_departments membership rows.",
    ],
    protected: [
      "Writes corrected values only - no row is deleted and no membership is removed.",
      "Safe to run as often as you like; a second run reports zero rows.",
    ],
    reversibility:
      "Nothing is destroyed, so there is nothing to undo. This is a repair, not a deletion.",
    confirmKind: "none",
    confirmPhrase: null,
    runLabel: "Run repair",
    tone: "blue",
  },
  clear_caches: {
    key: "clear_caches",
    auditEntityId: "7d1f6c60-1a4a-4c1e-9f2b-0d7a5b3c1106",
    title: "Clear application caches",
    summary:
      "Invalidate every cached tag and re-render all routes, so the next request rebuilds from the database.",
    blastRadius: [
      "Invalidates the tasks, employees, subjects, status-settings, clients, project-nodes and masters cache tags.",
      "Revalidates every route under the root layout.",
      "The next few page loads are slower while caches refill.",
    ],
    protected: ["No data is read, written or deleted. Caches only."],
    reversibility: "Nothing to undo - caches rebuild themselves on the next request.",
    confirmKind: "none",
    confirmPhrase: null,
    runLabel: "Clear caches",
    tone: "blue",
  },
};

/**
 * Server-side confirmation check. `typed` comes from a hostile client, so it is
 * compared here rather than trusted from the dialog: the phrase must match
 * exactly (after trimming), the email case-insensitively.
 */
export function confirmationMatches(
  meta: DangerZoneOperationMeta,
  typed: string,
  targetEmail?: string,
): boolean {
  const value = typed.trim();
  if (meta.confirmKind === "none") return true;
  if (meta.confirmKind === "email") {
    return (
      value.length > 0 &&
      typeof targetEmail === "string" &&
      value.toLowerCase() === targetEmail.trim().toLowerCase()
    );
  }
  return meta.confirmPhrase !== null && value === meta.confirmPhrase;
}
