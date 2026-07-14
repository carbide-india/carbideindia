import "server-only";
import { getOrgSettings } from "@/lib/queries/org-settings";
import type { WorkflowFlagKey } from "@/db/enums";

/**
 * ERP Phase 8 - per-entity enforced-workflow feature flags (SUPREME SAFETY
 * CONSTRAINT). A flag is ON only when `org_settings.workflow_flags[key] === true`.
 * ABSENT or `false` === OFF, which is the default and the deploy state: with the
 * flag OFF the app behaves EXACTLY as pre-Phase-8 (independent New-Quotation /
 * Negotiation / SO forms + free-set status dropdowns keep working unchanged, and
 * `advanceStage` refuses to enforce).
 *
 * Read SERVER-SIDE only (org_settings is a server query). Every enforcement site
 * (advanceStage, the flag-gated detail-page CTAs, the New-form redirect guards)
 * consults this so there is one place the flag is defaulted OFF.
 */

/** True iff the named entity's enforced-workflow flag is explicitly ON. */
export function isFlagOnIn(
  flags: Record<string, boolean> | null | undefined,
  key: WorkflowFlagKey,
): boolean {
  return flags?.[key] === true;
}

/** Async convenience: load org settings and report the flag (defaults OFF). */
export async function isWorkflowFlagOn(key: WorkflowFlagKey): Promise<boolean> {
  const settings = await getOrgSettings();
  return isFlagOnIn(settings.workflowFlags, key);
}
