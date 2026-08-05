import { TriangleAlert, Info } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  getWorkflowGateState,
  listWorkflowGateEvents,
} from "@/lib/queries/workflow_control";
import { formatDate, formatTimeInTz } from "@/lib/format";
import { WORKFLOW_GATES } from "@/lib/workflow-control-catalogue";
import { WorkflowControlChain } from "@/components/admin/workflow-control-chain";
import { WorkflowControlGateList } from "@/components/admin/workflow-control-gate-list";
import { WorkflowControlEvents } from "@/components/admin/workflow-control-events";
import { WorkflowControlDanger } from "@/components/admin/workflow-control-danger";

export const dynamic = "force-dynamic";

/**
 * Admin · Workflow & Data → Workflow control. The one screen where the enforced
 * pipeline is switched on or off. Everything shown is derived: the gate state
 * from `org_settings.workflow_flags`, the conditions from the transition table,
 * and the history from `settings_events` — this page invents nothing.
 */
export default async function WorkflowControlPage() {
  await requireAdmin();

  const [state, events, settings] = await Promise.all([
    getWorkflowGateState(),
    listWorkflowGateEvents(25),
    getOrgSettings(),
  ]);

  const liveCount = WORKFLOW_GATES.filter((g) => g.wiring !== "reserved").length;
  const enforcedLabels = WORKFLOW_GATES.filter((g) => state.flags[g.key]).map(
    (g) => g.label,
  );
  const inertlyOn = WORKFLOW_GATES.filter(
    (g) => state.flags[g.key] && g.wiring === "reserved",
  );

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Workflow &amp; Data
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Workflow Control
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          {WORKFLOW_GATES.length} gates · {state.enabledCount} enforced ·{" "}
          {liveCount} wired into the app ·{" "}
          {state.updatedAt
            ? `settings last changed ${formatDate(state.updatedAt)} ${formatTimeInTz(state.updatedAt, settings.timezone)}${state.updatedByName ? ` by ${state.updatedByName}` : ""}`
            : "never changed"}
        </p>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[#6b7280]">
          Each gate forces one hand-off in the pipeline to go through a single
          server-checked route instead of a free-form form. A gate is on only
          when it is explicitly switched on here — anything else means the app
          behaves exactly as it did before enforcement existed.
        </p>
      </header>

      {!state.settingsRowExists && (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-section border px-4 py-3 text-[13.5px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
            background: "var(--color-red-bg)",
            color: "var(--color-red-deep)",
          }}
        >
          <TriangleAlert size={16} strokeWidth={2.2} className="mt-[2px] shrink-0" aria-hidden="true" />
          <span>
            The organisation settings row has not been seeded, so gate changes
            cannot be saved. Run <code>pnpm db:migrate</code> then{" "}
            <code>pnpm seed:defaults</code>. Every gate is shown as off, which is
            also how the app behaves.
          </span>
        </div>
      )}

      {inertlyOn.length > 0 && (
        <div
          className="mb-5 flex gap-2.5 rounded-section border px-4 py-3 text-[13.5px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 32%, transparent)",
            background: "var(--color-amber-bg)",
            color: "var(--color-amber-deep)",
          }}
        >
          <Info size={16} strokeWidth={2.2} className="mt-[2px] shrink-0" aria-hidden="true" />
          <span>
            {inertlyOn.map((g) => g.label).join(", ")}{" "}
            {inertlyOn.length === 1 ? "is" : "are"} switched on but no code reads{" "}
            {inertlyOn.length === 1 ? "it" : "them"} yet — the pipeline is not
            actually enforced at{" "}
            {inertlyOn.length === 1 ? "that stage" : "those stages"}.
          </span>
        </div>
      )}

      {state.orphanKeys.length > 0 && (
        <div
          className="mb-5 rounded-section border border-hairline-strong bg-surface-soft px-4 py-3 text-[13px] text-ink-subtle"
        >
          Stored flags with no matching gate (left untouched):{" "}
          {state.orphanKeys.map((k) => (
            <code
              key={k}
              className="mr-1.5 rounded bg-surface-track px-1.5 py-0.5 text-[11.5px]"
              style={{ fontFamily: "var(--font-mono-display)" }}
            >
              {k}
            </code>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <WorkflowControlChain flags={state.flags} />
        <WorkflowControlGateList
          flags={state.flags}
          locked={!state.settingsRowExists}
        />
        <WorkflowControlEvents events={events} timezone={settings.timezone} />
        <WorkflowControlDanger
          enforcedLabels={enforcedLabels}
          locked={!state.settingsRowExists}
        />
      </div>
    </div>
  );
}
