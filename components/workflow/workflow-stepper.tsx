import { Stepper } from "@/components/erp/stepper";
import { PIPELINE_STAGE_LABELS, type ResolvedStage } from "@/lib/flow/derive-stage";
import { NextStepButton } from "@/components/workflow/next-step-button";
import type { AdvanceEntity } from "@/app/(app)/_actions/advance-stage";

interface Props {
  /** The resolved pipeline position (from smRollupStage / itemFurthestStage). */
  resolved: ResolvedStage;
  /** When set + `flagOn`, renders the flag-gated advance CTA below the stepper. */
  advance?: { entity: AdvanceEntity; id: string; label: string };
  /** Whether the entity's enforced-workflow flag is ON (server-resolved). */
  flagOn?: boolean;
}

/**
 * ERP Phase 8 - the canonical pipeline stepper block for detail pages. The
 * `Stepper` itself is a pure, read-only presentation fed EXCLUSIVELY by
 * derive-stage, so it is a safe addition even when the flag is OFF. The advance
 * CTA (which funnels through `advanceStage`) renders ONLY when `flagOn` - flag
 * OFF leaves today's forms/dropdowns as the sole write path.
 */
export function WorkflowStepper({ resolved, advance, flagOn }: Props) {
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card px-4 py-3.5"
      aria-label="Pipeline progress"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Stepper current={resolved.index} />
        {advance && flagOn && (
          <NextStepButton entity={advance.entity} id={advance.id} label={advance.label} />
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-subtle">
        Current stage:{" "}
        <span className="font-semibold text-ink-strong">
          {PIPELINE_STAGE_LABELS[resolved.stage]}
        </span>
      </p>
    </section>
  );
}
