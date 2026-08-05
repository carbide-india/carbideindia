"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Lock,
  LockOpen,
  LoaderCircle,
  Snowflake,
  Ban,
  TriangleAlert,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setWorkflowGateAction } from "@/app/(admin)/admin/workflow-control/actions";
import {
  WORKFLOW_GATES,
  gateActorRole,
  gateConditions,
  stageLabel,
  type WorkflowFlagKey,
  type WorkflowGateSpec,
} from "@/lib/workflow-control-catalogue";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  flags: Record<WorkflowFlagKey, boolean>;
  /** True when org_settings has not been seeded — writes would fail. */
  locked: boolean;
}

/**
 * One card per gate: current state, what turning it ON changes for users, the
 * server-enforced conditions read out of the transition table, and the switch.
 * Every flip goes through an explicit confirm dialog (it changes behaviour for
 * everyone in the company, in both directions) and re-reads from the server on
 * success — no optimistic state, so what is on screen is what is in the DB.
 */
export function WorkflowControlGateList({ flags, locked }: Props) {
  const router = useRouter();
  const [request, setRequest] = useState<{
    spec: WorkflowGateSpec;
    next: boolean;
  } | null>(null);
  // The dialog's form state lives here so opening it resets the fields in the
  // click handler - no effect, no cascading render.
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openConfirm(spec: WorkflowGateSpec, next: boolean) {
    setNote("");
    setError(null);
    setRequest({ spec, next });
  }

  function closeConfirm() {
    if (pending) return;
    setRequest(null);
  }

  function confirm() {
    if (!request) return;
    setError(null);
    const { spec, next } = request;
    startTransition(async () => {
      const res = await setWorkflowGateAction({
        key: spec.key,
        enabled: next,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: res.changed
          ? `${spec.label} gate ${next ? "enforced" : "turned off"}.`
          : `${spec.label} gate was already ${next ? "on" : "off"}.`,
        type: next ? "success" : "info",
      });
      setRequest(null);
      router.refresh();
    });
  }

  return (
    <>
      <section aria-labelledby="workflow-gates-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2
            id="workflow-gates-heading"
            className="text-[15px] font-bold tracking-tight text-ink-strong"
          >
            Gates
          </h2>
          <p className="text-[12.5px] text-ink-subtle">
            A gate is ON only when it is explicitly enabled here. Absent or off ={" "}
            <span className="font-semibold text-ink-soft">pre-enforcement behaviour</span>.
          </p>
        </div>

        {WORKFLOW_GATES.map((spec) => (
          <GateCard
            key={spec.key}
            spec={spec}
            on={flags[spec.key] === true}
            locked={locked}
            onRequestChange={(next) => openConfirm(spec, next)}
          />
        ))}
      </section>

      <ConfirmGateDialog
        request={request}
        note={note}
        onNoteChange={setNote}
        error={error}
        pending={pending}
        onConfirm={confirm}
        onClose={closeConfirm}
      />
    </>
  );
}

function GateCard({
  spec,
  on,
  locked,
  onRequestChange,
}: {
  spec: WorkflowGateSpec;
  on: boolean;
  locked: boolean;
  onRequestChange: (next: boolean) => void;
}) {
  const conditions = gateConditions(spec);
  const role = gateActorRole(spec);
  const inert = spec.wiring === "reserved";

  return (
    <article
      className="rounded-section border bg-surface-card p-4"
      style={{
        borderColor: on
          ? `color-mix(in srgb, var(--color-${inert ? "amber" : "green"}) 30%, transparent)`
          : "var(--color-hairline-strong)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15.5px] font-bold tracking-tight text-ink-strong">
              {spec.label} gate
            </h3>
            <StatePill on={on} inert={inert} />
            <WiringPill spec={spec} />
            <code
              className="rounded bg-surface-track px-1.5 py-0.5 text-[11px] text-ink-muted"
              style={{ fontFamily: "var(--font-mono-display)" }}
            >
              workflow_flags.{spec.key}
            </code>
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-subtle tabular-nums">
            {stageLabel(spec.from)}
            {spec.to ? ` → ${stageLabel(spec.to)}` : " · terminal stage"} ·{" "}
            <span className="font-semibold text-ink-soft">{spec.actionLabel}</span> ·
            actor: <span className="uppercase">{role}</span>
            {spec.freezes.length > 0 && ` · freezes ${spec.freezes.length} columns`}
          </p>
        </div>

        <GateSwitch
          spec={spec}
          on={on}
          locked={locked}
          onRequestChange={onRequestChange}
        />
      </div>

      {spec.wiringNote && (
        <p
          className="mt-3 flex gap-2 rounded-md px-3 py-2 text-[12.5px] leading-relaxed"
          style={{
            background: inert ? "var(--color-slate-bg)" : "var(--color-amber-bg)",
            color: inert ? "var(--color-slate-deep)" : "var(--color-amber-deep)",
          }}
        >
          <TriangleAlert size={14} strokeWidth={2.2} className="mt-[2px] shrink-0" aria-hidden="true" />
          <span>{spec.wiringNote}</span>
        </p>
      )}

      <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        <div>
          <SubHeading>What turning it on changes</SubHeading>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {spec.effectsOn.map((e) => (
              <li key={e} className="flex gap-2 text-[13px] leading-snug text-ink-soft">
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                  style={{ background: "var(--color-brand)" }}
                  aria-hidden="true"
                />
                <span>{e}</span>
              </li>
            ))}
          </ul>

          {spec.blockedForms.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-subtle">
                <Ban size={12} strokeWidth={2.2} aria-hidden="true" /> Forms redirected:
              </span>
              {spec.blockedForms.map((f) => (
                <code
                  key={f}
                  className="rounded bg-surface-track px-1.5 py-0.5 text-[11px] text-ink-muted"
                  style={{ fontFamily: "var(--font-mono-display)" }}
                >
                  {f}
                </code>
              ))}
            </div>
          )}
        </div>

        <div>
          <SubHeading>Conditions the server enforces</SubHeading>
          {conditions.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-snug text-ink-subtle">
              No transition is defined out of this stage, so there is nothing to
              guard.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {conditions.map((c) => (
                <li
                  key={c}
                  className="flex gap-2 text-[13px] leading-snug text-ink-soft"
                >
                  <ShieldCheck
                    size={13}
                    strokeWidth={2.2}
                    className="mt-[2px] shrink-0"
                    style={{ color: "var(--color-brand)" }}
                    aria-hidden="true"
                  />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          {spec.freezes.length > 0 && (
            <div className="mt-2.5">
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-subtle">
                <Snowflake size={12} strokeWidth={2.2} aria-hidden="true" /> Frozen on the move:
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {spec.freezes.map((f) => (
                  <code
                    key={f}
                    className="rounded bg-surface-track px-1.5 py-0.5 text-[11px] text-ink-muted"
                    style={{ fontFamily: "var(--font-mono-display)" }}
                  >
                    {f}
                  </code>
                ))}
              </div>
            </div>
          )}

          {spec.provisions && (
            <p className="mt-2 text-[12.5px] text-ink-subtle">
              Auto-created: <span className="text-ink-soft">{spec.provisions}</span>
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 border-t border-hairline pt-2.5 text-[12.5px] leading-snug text-ink-subtle">
        <span className="font-semibold text-ink-soft">While it is off:</span>{" "}
        {spec.behaviourOff}
      </p>
    </article>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle"
      style={{ fontFamily: "var(--font-mono-display)" }}
    >
      {children}
    </span>
  );
}

function StatePill({ on, inert }: { on: boolean; inert: boolean }) {
  const tone = on ? (inert ? "amber" : "green") : "slate";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{
        background: on ? `var(--color-${tone}-bg)` : "var(--color-surface-track)",
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {on ? <Lock size={11} strokeWidth={2.6} /> : <LockOpen size={11} strokeWidth={2.6} />}
      {on ? "Enforced" : "Open"}
    </span>
  );
}

function WiringPill({ spec }: { spec: WorkflowGateSpec }) {
  if (spec.wiring === "live") return null;
  const reserved = spec.wiring === "reserved";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{
        background: reserved ? "var(--color-slate-bg)" : "var(--color-amber-bg)",
        color: reserved ? "var(--color-slate-deep)" : "var(--color-amber-deep)",
      }}
    >
      {reserved ? <Clock size={11} strokeWidth={2.6} /> : <TriangleAlert size={11} strokeWidth={2.6} />}
      {reserved ? "Reserved" : "Partly wired"}
    </span>
  );
}

function GateSwitch({
  spec,
  on,
  locked,
  onRequestChange,
}: {
  spec: WorkflowGateSpec;
  on: boolean;
  locked: boolean;
  onRequestChange: (next: boolean) => void;
}) {
  const labelId = `gate-switch-label-${spec.key}`;
  return (
    <div className="flex items-center gap-2.5">
      <span id={labelId} className="text-[12.5px] font-semibold text-ink-soft">
        {on ? "Enforced" : "Off"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-label={`${spec.label} gate`}
        disabled={locked}
        onClick={() => onRequestChange(!on)}
        title={
          locked
            ? "Organisation settings have not been seeded yet"
            : on
              ? `Turn the ${spec.label} gate off`
              : `Enforce the ${spec.label} gate`
        }
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: on ? "var(--color-brand)" : "var(--color-surface-track)",
          border: `1px solid ${on ? "var(--color-brand-deep)" : "var(--color-hairline-strong)"}`,
          outlineColor: "var(--color-brand)",
        }}
      >
        <span
          className="inline-block rounded-full bg-white transition-transform"
          style={{
            height: 18,
            width: 18,
            transform: on ? "translateX(23px)" : "translateX(3px)",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.25)",
          }}
        />
      </button>
    </div>
  );
}

function ConfirmGateDialog({
  request,
  note,
  onNoteChange,
  error,
  pending,
  onConfirm,
  onClose,
}: {
  request: { spec: WorkflowGateSpec; next: boolean } | null;
  note: string;
  onNoteChange: (v: string) => void;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const spec = request?.spec;
  const next = request?.next ?? false;

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(o) => {
        if (!o && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            // Focus Cancel, not the destructive confirm.
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
        >
          <Dialog.Title className="font-serif text-xl text-[#0F172A]">
            {next
              ? `Enforce the ${spec?.label} gate?`
              : `Turn off the ${spec?.label} gate?`}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[14px] leading-relaxed text-[#64748B]">
            {next
              ? "This changes how the pipeline behaves for everyone immediately. Nothing already recorded is altered, but from now on:"
              : "Enforcement stops immediately and the pipeline returns to its pre-enforcement behaviour. Anything already frozen stays frozen. From now on:"}
          </Dialog.Description>

          {spec && (
            <ul className="mt-3 flex flex-col gap-1.5 rounded-md bg-[#F8FAFC] px-3.5 py-3">
              {(next ? spec.effectsOn : [spec.behaviourOff]).map((line) => (
                <li key={line} className="flex gap-2 text-[13px] leading-snug text-[#334155]">
                  <span
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                    style={{ background: "var(--color-brand)" }}
                    aria-hidden="true"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          {spec && next && spec.wiring !== "live" && (
            <p
              className="mt-3 flex gap-2 rounded-md px-3 py-2 text-[12.5px] leading-relaxed"
              style={{
                background: "var(--color-amber-bg)",
                color: "var(--color-amber-deep)",
              }}
            >
              <TriangleAlert size={14} strokeWidth={2.2} className="mt-[2px] shrink-0" aria-hidden="true" />
              <span>{spec.wiringNote}</span>
            </p>
          )}

          <div className="mt-4">
            <label
              htmlFor="gate-change-note"
              className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
            >
              Reason <span className="font-normal text-[#64748B]">(optional — recorded in the audit trail)</span>
            </label>
            <input
              id="gate-change-note"
              value={note}
              maxLength={280}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. Enabling after the sales team training on 12 Aug"
              className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14px]"
            />
          </div>

          {error && (
            <AdminInlineError className="mt-3">
              {error}
            </AdminInlineError>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md px-4 py-2.5 text-[14px] font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{
                background: next
                  ? "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))"
                  : "var(--color-ink-soft)",
              }}
            >
              {pending && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              {pending
                ? "Saving"
                : next
                  ? "Enforce gate"
                  : "Turn gate off"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
