import { History, Lock, LockOpen } from "lucide-react";
import { formatDate, formatTimeInTz } from "@/lib/format";
import { gateSpecFor } from "@/lib/workflow-control-catalogue";
import type { WorkflowGateEvent } from "@/lib/queries/workflow_control";

interface Props {
  events: WorkflowGateEvent[];
  /** Timezone the org runs on, for the timestamps. */
  timezone: string;
}

/**
 * The gate change history straight out of `settings_events` (scope
 * `workflow_flags`). Server-rendered so the timestamps are formatted once, in
 * the organisation's timezone, with no client/server drift.
 */
export function WorkflowControlEvents({ events, timezone }: Props) {
  return (
    <section
      aria-labelledby="workflow-events-heading"
      className="rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pb-3 pt-4">
        <h2
          id="workflow-events-heading"
          className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink-strong"
        >
          <History size={15} strokeWidth={2.2} aria-hidden="true" />
          Change history
        </h2>
        <p className="text-[12.5px] text-ink-subtle tabular-nums">
          {events.length === 0
            ? "No gate has ever been changed"
            : `${events.length} most recent change${events.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="border-t border-hairline px-5 py-8 text-center text-[13.5px] text-ink-subtle">
          Every gate is at its shipped default. The first time one is flipped, it
          is recorded here with who did it and why.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-hairline">
          <table className="w-full min-w-[640px] text-[14px]">
            <caption className="sr-only">
              Workflow gate changes, newest first
            </caption>
            <thead>
              <tr
                className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th scope="col" className="px-5 py-2.5">When</th>
                <th scope="col" className="px-5 py-2.5">Gate</th>
                <th scope="col" className="px-5 py-2.5">Change</th>
                <th scope="col" className="px-5 py-2.5">By</th>
                <th scope="col" className="px-5 py-2.5">Reason</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const spec = ev.targetId ? gateSpecFor(ev.targetId) : undefined;
                const enabled = ev.eventType === "enabled";
                return (
                  <tr
                    key={ev.id}
                    className="border-b border-hairline last:border-b-0"
                    style={{
                      background: i % 2 === 1 ? "var(--color-surface-stripe)" : undefined,
                    }}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-soft">
                      {formatDate(ev.createdAt)}
                      <span className="ml-1.5 text-ink-subtle">
                        {formatTimeInTz(ev.createdAt, timezone)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-ink-strong">
                      {spec?.label ?? ev.targetId ?? "—"}
                      {!spec && ev.targetId && (
                        <span className="ml-1.5 text-[11.5px] text-ink-subtle">
                          (retired key)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                        style={{
                          background: enabled
                            ? "var(--color-green-bg)"
                            : "var(--color-surface-track)",
                          color: enabled
                            ? "var(--color-green-deep)"
                            : "var(--color-ink-muted)",
                        }}
                      >
                        {enabled ? (
                          <Lock size={11} strokeWidth={2.6} aria-hidden="true" />
                        ) : (
                          <LockOpen size={11} strokeWidth={2.6} aria-hidden="true" />
                        )}
                        {enabled ? "Enforced" : "Turned off"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-ink-soft">
                      {ev.actorName ?? "Unknown"}
                    </td>
                    <td className="px-5 py-2.5 text-ink-subtle">
                      {ev.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
