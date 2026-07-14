import { redirect } from "next/navigation";
import type { Route } from "next";
import { isWorkflowFlagOn } from "@/lib/workflow/flags";
import type { WorkflowFlagKey } from "@/db/enums";

/**
 * ERP Phase 8 - the enforced-workflow guard for the standalone New forms. When
 * the named PREDECESSOR flag is ON, that stage auto-provisions this entity's
 * draft via `advanceStage`, so the free-standing New form is a double-provision
 * hazard - this redirects it to the register instead. When the flag is OFF
 * (default) it is a pure no-op and the New form renders exactly as today.
 *
 * Usage: `await enforcedNewGuard("quotation", "/negotiations")` at the top of the
 * New-Negotiation page (a sent quote auto-creates the negotiation), and
 * `await enforcedNewGuard("negotiation", "/sales-orders")` on New-Sales-Order.
 */
export async function enforcedNewGuard(
  predecessorFlag: WorkflowFlagKey,
  redirectTo: Route,
): Promise<void> {
  if (await isWorkflowFlagOn(predecessorFlag)) {
    redirect(redirectTo);
  }
}
