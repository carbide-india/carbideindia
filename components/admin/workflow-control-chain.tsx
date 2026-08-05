import { Lock, LockOpen, MoveRight, Clock } from "lucide-react";
import {
  WORKFLOW_CHAIN,
  gateSpecFor,
  type ChainNode,
  type WorkflowFlagKey,
} from "@/lib/workflow-control-catalogue";

interface Props {
  flags: Record<WorkflowFlagKey, boolean>;
}

/**
 * The pipeline as a chain: one card per stage, and between two stages the gate
 * that governs the hand-off. Read-only — every control lives in the gate list
 * below it. A hand-off with no gate is drawn as a plain arrow, which is the
 * honest picture: those stages keep their ordinary status UI and nothing
 * enforces the order.
 */
export function WorkflowControlChain({ flags }: Props) {
  const enforced = WORKFLOW_CHAIN.filter(
    (n) => n.gateAfter !== null && flags[n.gateAfter],
  ).length;

  return (
    <section
      aria-labelledby="workflow-chain-heading"
      className="rounded-section border border-hairline bg-surface-card p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id="workflow-chain-heading"
          className="text-[15px] font-bold tracking-tight text-ink-strong"
        >
          Pipeline map
        </h2>
        <p className="text-[12.5px] text-ink-subtle tabular-nums">
          {enforced === 0
            ? "No hand-off is enforced — every stage is advanced by hand."
            : `${enforced} of ${WORKFLOW_CHAIN.filter((n) => n.gateAfter !== null).length} hand-offs enforced`}
        </p>
      </div>

      <ol className="mt-4 flex flex-wrap items-stretch gap-y-3">
        {WORKFLOW_CHAIN.map((node, i) => (
          <li key={node.id} className="flex items-stretch">
            <ChainCard node={node} index={i} />
            {i < WORKFLOW_CHAIN.length - 1 && (
              <Connector gate={node.gateAfter} flags={flags} />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3 text-[11.5px] text-ink-subtle">
        <LegendSwatch tone="green" icon={<Lock size={11} strokeWidth={2.4} />} label="Gate enforced" />
        <LegendSwatch tone="slate" icon={<LockOpen size={11} strokeWidth={2.4} />} label="Gate open (default)" />
        <LegendSwatch tone="amber" icon={<Clock size={11} strokeWidth={2.4} />} label="Reserved — nothing reads it yet" />
        <span className="inline-flex items-center gap-1.5">
          <MoveRight size={12} strokeWidth={2.2} aria-hidden="true" />
          Not gated — ordinary status controls
        </span>
      </div>
    </section>
  );
}

function ChainCard({ node, index }: { node: ChainNode; index: number }) {
  const isSales = node.band === "sales";
  return (
    <div
      className="flex w-[132px] flex-col justify-between rounded-md border px-2.5 py-2"
      style={{
        borderColor: isSales
          ? "color-mix(in srgb, var(--color-brand) 24%, transparent)"
          : "var(--color-hairline-strong)",
        background: isSales
          ? "color-mix(in srgb, var(--color-brand) 4%, var(--color-surface-card))"
          : "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="mt-[1px] text-[10px] font-bold tabular-nums"
          style={{
            fontFamily: "var(--font-mono-display)",
            color: isSales ? "var(--color-brand)" : "var(--color-ink-subtle)",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="text-[12.5px] font-semibold leading-tight text-ink-strong">
          {node.label}
        </span>
      </div>
      <span className="mt-1 block text-[10.5px] leading-snug text-ink-subtle">
        {node.hint}
      </span>
    </div>
  );
}

function Connector({
  gate,
  flags,
}: {
  gate: WorkflowFlagKey | null;
  flags: Record<WorkflowFlagKey, boolean>;
}) {
  if (gate === null) {
    return (
      <div className="flex w-8 items-center justify-center text-ink-subtle" aria-hidden="true">
        <MoveRight size={14} strokeWidth={2} />
      </div>
    );
  }

  const spec = gateSpecFor(gate);
  const on = flags[gate] === true;
  const reserved = spec?.wiring === "reserved";
  const tone = on ? (reserved ? "amber" : "green") : "slate";
  const stateWord = on ? (reserved ? "On (inert)" : "Enforced") : "Open";

  return (
    <div className="flex w-[104px] items-center justify-center px-1">
      <span
        className="inline-flex flex-col items-center gap-0.5 rounded-full border px-2 py-1 text-center"
        style={{
          borderColor: `color-mix(in srgb, var(--color-${tone}) ${on ? "38%" : "20%"}, transparent)`,
          background: on ? `var(--color-${tone}-bg)` : "var(--color-surface-track)",
          color: `var(--color-${tone}-deep)`,
        }}
        title={`${spec?.label ?? gate} gate — ${stateWord}`}
      >
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.08em]">
          {on ? <Lock size={10} strokeWidth={2.6} /> : <LockOpen size={10} strokeWidth={2.6} />}
          {stateWord}
        </span>
        <span
          className="text-[9.5px] leading-none"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          {gate}
        </span>
      </span>
    </div>
  );
}

function LegendSwatch({
  tone,
  icon,
  label,
}: {
  tone: "green" | "slate" | "amber";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
        style={{
          background: `var(--color-${tone}-bg)`,
          color: `var(--color-${tone}-deep)`,
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      {label}
    </span>
  );
}
