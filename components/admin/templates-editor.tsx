"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CornerDownLeft,
  FileCode2,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  restoreTemplateDefault,
  saveTemplate,
  sendTemplateTest,
  setTemplateActive,
} from "@/app/(admin)/admin/templates/actions";
import type { TemplateSlot } from "@/lib/queries/templates";
import {
  BODY_HARD_MAX,
  CHANNEL_FALLBACKS,
  CHANNEL_SUBJECT_LABELS,
  CHANNEL_SUBJECT_SOFT_MAX,
  KIND_DESCRIPTIONS,
  KIND_LABELS,
  NAME_HARD_MAX,
  SUBJECT_HARD_MAX,
  TEMPLATE_CHANNEL_LABELS,
  defaultTemplate,
  validateTemplate,
  variablesForKind,
} from "@/lib/templates/catalogue";
import { TemplatesConfirmDialog } from "@/components/admin/templates-confirm-dialog";
import { TemplatesPreview } from "@/components/admin/templates-preview";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  slot: TemplateSlot;
  /** The signed-in admin's own address — the only test-send destination. */
  adminEmail: string;
  /** False when RESEND_API_KEY is unset, so the UI can say so up front. */
  emailConfigured: boolean;
}

type ConfirmKind = "restore" | "deactivate" | "test";

/**
 * The editor for one (kind, channel) slot.
 *
 * The parent remounts this per slot (`key={slot.key}`), so local draft state
 * resets on navigation without a synchronising effect.
 */
export function TemplatesEditor({ slot, adminEmail, emailConfigured }: Props) {
  const router = useRouter();
  const [name, setName] = useState(slot.name);
  const [subject, setSubject] = useState(slot.subject);
  const [body, setBody] = useState(slot.body);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [pending, startTransition] = useTransition();

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const shipped = useMemo(
    () => defaultTemplate(slot.kind, slot.channel),
    [slot.kind, slot.channel],
  );
  const variables = useMemo(() => variablesForKind(slot.kind), [slot.kind]);
  const check = useMemo(
    () => validateTemplate({ kind: slot.kind, subject, body }),
    [slot.kind, subject, body],
  );

  const dirty =
    name !== slot.name || subject !== slot.subject || body !== slot.body;
  const blank = subject.trim().length === 0 || body.trim().length === 0;
  const canSave = dirty && check.ok && !blank && name.trim().length > 0;

  const idBase = slot.key.replace(":", "-");
  const subjectSoftMax = CHANNEL_SUBJECT_SOFT_MAX[slot.channel];
  const fallback = CHANNEL_FALLBACKS[slot.channel];

  /** Insert `{{token}}` wherever the caret last was. */
  const insertToken = useCallback(
    (token: string) => {
      const snippet = `{{${token}}}`;
      if (lastFocused.current === "subject") {
        const el = subjectRef.current;
        if (!el) return;
        const start = el.selectionStart ?? subject.length;
        const end = el.selectionEnd ?? start;
        const next = subject.slice(0, start) + snippet + subject.slice(end);
        setSubject(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + snippet.length, start + snippet.length);
        });
        return;
      }
      const el = bodyRef.current;
      if (!el) return;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? start;
      const next = body.slice(0, start) + snippet + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + snippet.length, start + snippet.length);
      });
    },
    [subject, body],
  );

  function onSave() {
    if (!canSave) return;
    startTransition(async () => {
      const res = await saveTemplate({
        kind: slot.kind,
        channel: slot.channel,
        name: name.trim(),
        subject,
        body,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: `${KIND_LABELS[slot.kind]} · ${TEMPLATE_CHANNEL_LABELS[slot.channel]} saved and switched on.`,
      });
      router.refresh();
    });
  }

  function onToggleActive(next: boolean) {
    startTransition(async () => {
      const res = await setTemplateActive({
        kind: slot.kind,
        channel: slot.channel,
        isActive: next,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setConfirm(null);
      fireToast({
        message: next
          ? "Custom wording is live for this event."
          : "Reverted to the built-in message.",
      });
      router.refresh();
    });
  }

  function onRestoreDefault() {
    startTransition(async () => {
      const res = await restoreTemplateDefault({
        kind: slot.kind,
        channel: slot.channel,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setName(res.name);
      setSubject(res.subject);
      setBody(res.body);
      setConfirm(null);
      fireToast({ message: "Shipped wording restored." });
      router.refresh();
    });
  }

  function onSendTest() {
    startTransition(async () => {
      const res = await sendTemplateTest({
        kind: slot.kind,
        channel: slot.channel,
        subject,
        body,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setConfirm(null);
      fireToast({
        message: res.skipped
          ? "Resend is not configured here, so nothing was sent."
          : `Test sent to ${res.sentTo}.`,
        type: res.skipped ? "info" : "success",
      });
    });
  }

  return (
    <div
      className="rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      onKeyDown={(e) => {
        // Ctrl/Cmd+S is the muscle memory for a text editor; honour it.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSave();
        }
      }}
    >
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-bold tracking-tight text-ink-strong">
              {KIND_LABELS[slot.kind]}
            </h2>
            <span
              className="rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{
                background: "var(--color-surface-soft)",
                color: "var(--color-ink-subtle)",
                border: "1px solid var(--color-hairline-strong)",
              }}
            >
              {TEMPLATE_CHANNEL_LABELS[slot.channel]}
            </span>
            <SlotStatusChip slot={slot} />
          </div>
          <p className="mt-1.5 max-w-xl text-[13px] text-ink-subtle">
            {KIND_DESCRIPTIONS[slot.kind]}
          </p>
        </div>

        <ActiveSwitch
          slot={slot}
          pending={pending}
          onRequestOff={() => setConfirm("deactivate")}
          onTurnOn={() => onToggleActive(true)}
        />
      </div>

      {/* ------------------------------------------------- fallback notice */}
      <div className="border-b border-hairline bg-surface-soft px-5 py-3">
        <div className="flex items-start gap-2.5">
          <FileCode2 aria-hidden size={15} className="mt-[2px] shrink-0 text-ink-subtle" />
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            {slot.status === "custom" ? (
              <>
                <strong className="font-semibold text-ink-strong">
                  Custom wording is stored and switched on.
                </strong>{" "}
                Switch it off to fall back to{" "}
                <code className="rounded bg-white px-1 py-[1px] text-[11.5px] text-ink-soft">
                  {fallback.source}
                </code>
                .
              </>
            ) : (
              <>
                <strong className="font-semibold text-ink-strong">
                  This event uses the built-in message.
                </strong>{" "}
                It comes from{" "}
                <code className="rounded bg-white px-1 py-[1px] text-[11.5px] text-ink-soft">
                  {fallback.source}
                </code>
                {slot.status === "disabled"
                  ? " — a stored version exists but is switched off."
                  : " — nothing is stored for this slot yet."}
              </>
            )}{" "}
            {fallback.note}
          </p>
        </div>
      </div>

      {slot.validationError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-3 text-[12.5px] text-[#B71C1C]"
        >
          <AlertTriangle aria-hidden size={15} className="mt-[1px] shrink-0" />
          <span>
            The stored version has a placeholder problem and will be ignored until
            it is fixed: {slot.validationError}
          </span>
        </div>
      )}

      {/* ----------------------------------------------------------- body */}
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <label
              htmlFor={`${idBase}-name`}
              className="mb-1.5 block text-[12px] font-semibold text-ink-strong"
            >
              Internal name
            </label>
            <input
              id={`${idBase}-name`}
              value={name}
              maxLength={NAME_HARD_MAX}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] text-ink-strong"
              placeholder={shipped.name}
            />
            <p className="mt-1 text-[11.5px] text-ink-subtle">
              Never shown to recipients — it labels this row in the admin.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label
                htmlFor={`${idBase}-subject`}
                className="text-[12px] font-semibold text-ink-strong"
              >
                {CHANNEL_SUBJECT_LABELS[slot.channel]}
              </label>
              <CharCount
                length={subject.length}
                soft={subjectSoftMax}
                hard={SUBJECT_HARD_MAX}
              />
            </div>
            <input
              id={`${idBase}-subject`}
              ref={subjectRef}
              value={subject}
              maxLength={SUBJECT_HARD_MAX}
              onFocus={() => (lastFocused.current = "subject")}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-[#CBD5E1] px-3 py-2 font-mono text-[13px] text-ink-strong"
              placeholder={shipped.subject}
              aria-describedby={`${idBase}-tokens`}
            />
            {subject.length > subjectSoftMax && (
              <p className="mt-1 text-[11.5px] text-[#B45309]">
                Over {subjectSoftMax} characters — likely to be truncated on{" "}
                {TEMPLATE_CHANNEL_LABELS[slot.channel]}.
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label
                htmlFor={`${idBase}-body`}
                className="text-[12px] font-semibold text-ink-strong"
              >
                Message body
              </label>
              <CharCount length={body.length} soft={BODY_HARD_MAX} hard={BODY_HARD_MAX} />
            </div>
            <textarea
              id={`${idBase}-body`}
              ref={bodyRef}
              value={body}
              rows={11}
              maxLength={BODY_HARD_MAX}
              onFocus={() => (lastFocused.current = "body")}
              onChange={(e) => setBody(e.target.value)}
              className="w-full resize-y rounded-md border border-[#CBD5E1] px-3 py-2 font-mono text-[13px] leading-relaxed text-ink-strong"
              placeholder={shipped.body}
              aria-describedby={`${idBase}-tokens`}
            />
          </div>

          {check.error && (
            <AdminInlineError>
              {check.error}
            </AdminInlineError>
          )}
          {!check.error && blank && (
            <div
              role="alert"
              className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12.5px] text-[#B45309]"
            >
              Both the {CHANNEL_SUBJECT_LABELS[slot.channel].toLowerCase()} and the
              body must have content before this can be saved.
            </div>
          )}
        </div>

        {/* ------------------------------------------------ variable rail */}
        <aside className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby={`${idBase}-tokens`}>
            <h3
              id={`${idBase}-tokens`}
              className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
              style={{ fontFamily: "var(--font-mono-display)" }}
            >
              Available variables
            </h3>
            <ul className="flex flex-col gap-1">
              {variables.map((v) => {
                const used = check.usedTokens.includes(v.token);
                return (
                  <li key={v.token}>
                    <button
                      type="button"
                      onClick={() => insertToken(v.token)}
                      title={`Insert {{${v.token}}} — sample: ${v.sample}`}
                      className="group flex w-full items-start gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-left transition-colors hover:border-hairline-strong hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        outlineColor: "var(--color-brand)",
                        background: used ? "var(--color-surface-soft)" : undefined,
                      }}
                    >
                      <Plus
                        aria-hidden
                        size={12}
                        className="mt-[4px] shrink-0 text-ink-subtle"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12px] font-semibold text-ink-strong">
                          {`{{${v.token}}}`}
                        </span>
                        <span className="block text-[11px] leading-snug text-ink-subtle">
                          {v.label}
                        </span>
                      </span>
                      {used && (
                        <span className="mt-[3px] shrink-0 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#15803d]">
                          used
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-ink-subtle">
              Anything else in double braces is rejected on save.
            </p>
          </section>

          <TemplatesPreview
            kind={slot.kind}
            channel={slot.channel}
            subject={subject}
            body={body}
          />
        </aside>
      </div>

      {/* ---------------------------------------------------------- footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-soft px-5 py-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || pending}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-45"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
          }}
        >
          {pending ? (
            <Loader2 aria-hidden size={14} className="animate-spin" />
          ) : (
            <Save aria-hidden size={14} />
          )}
          {pending ? "Working" : "Save & switch on"}
        </button>

        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => {
            setName(slot.name);
            setSubject(slot.subject);
            setBody(slot.body);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13.5px] font-semibold text-ink-soft hover:bg-white disabled:opacity-45"
        >
          <CornerDownLeft aria-hidden size={14} />
          Discard edits
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirm("restore")}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13.5px] font-semibold text-ink-soft hover:bg-white disabled:opacity-45"
        >
          <RotateCcw aria-hidden size={14} />
          Restore shipped wording
        </button>

        <div className="ml-auto flex items-center gap-3">
          {dirty && (
            <span className="text-[12px] font-medium text-[#B45309]">
              Unsaved changes
            </span>
          )}
          {slot.channel === "email" && (
            <button
              type="button"
              disabled={pending || !check.ok || blank}
              onClick={() => setConfirm("test")}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-semibold text-ink-soft hover:border-[#CBD5E1] disabled:opacity-45"
            >
              <Send aria-hidden size={14} />
              Send test to me
            </button>
          )}
        </div>
      </div>

      {slot.updatedAt && (
        <p className="border-t border-hairline px-5 py-2 text-[11.5px] text-ink-subtle tabular-nums">
          {/* Fixed locale + zone: this renders on the server too, and a
              browser-dependent format would break hydration. */}
          Last saved{" "}
          {slot.updatedAt.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {slot.updatedByName ? ` by ${slot.updatedByName}` : ""}
        </p>
      )}

      {/* --------------------------------------------------------- dialogs */}
      <TemplatesConfirmDialog
        open={confirm === "restore"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Restore the shipped wording?"
        description={
          <>
            The stored subject and body for{" "}
            <strong>
              {KIND_LABELS[slot.kind]} · {TEMPLATE_CHANNEL_LABELS[slot.channel]}
            </strong>{" "}
            will be overwritten with the version that ships in the codebase. Your
            current text is not recoverable from this screen — only the audit
            trail keeps a copy.
          </>
        }
        confirmLabel="Overwrite with shipped text"
        pendingLabel="Restoring"
        tone="danger"
        pending={pending}
        onConfirm={onRestoreDefault}
      />

      <TemplatesConfirmDialog
        open={confirm === "deactivate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Fall back to the built-in message?"
        description={
          <>
            Every future <strong>{KIND_LABELS[slot.kind]}</strong> message on{" "}
            <strong>{TEMPLATE_CHANNEL_LABELS[slot.channel]}</strong> will use{" "}
            <code>{fallback.source}</code> instead of your wording. The stored
            version is kept and can be switched back on at any time.
          </>
        }
        confirmLabel="Use the built-in message"
        pendingLabel="Switching"
        tone="brand"
        pending={pending}
        onConfirm={() => onToggleActive(false)}
      />

      <TemplatesConfirmDialog
        open={confirm === "test"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Send a test email to yourself?"
        description={
          <>
            The wording currently in the editor is rendered with sample data and
            emailed to <strong>{adminEmail || "your account"}</strong> — no other
            recipient, and no real task is touched.
            {!emailConfigured && (
              <span className="mt-2 block text-[#B45309]">
                RESEND_API_KEY is not set in this environment, so nothing will
                actually leave the server.
              </span>
            )}
          </>
        }
        confirmLabel="Send test"
        pendingLabel="Sending"
        tone="brand"
        pending={pending}
        onConfirm={onSendTest}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small parts                                                         */
/* ------------------------------------------------------------------ */

function CharCount({
  length,
  soft,
  hard,
}: {
  length: number;
  soft: number;
  hard: number;
}) {
  const over = length > soft;
  return (
    <span
      className="text-[11px] tabular-nums"
      style={{ color: over ? "#B45309" : "var(--color-ink-subtle)" }}
    >
      {length} / {hard}
    </span>
  );
}

export function SlotStatusChip({ slot }: { slot: TemplateSlot }) {
  const map = {
    custom: { label: "Custom", bg: "var(--color-green-bg)", fg: "var(--color-green-deep)" },
    disabled: { label: "Switched off", bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)" },
    builtin: { label: "Built-in", bg: "rgba(15, 23, 42, 0.05)", fg: "var(--color-ink-subtle)" },
  } as const;
  const tone = map[slot.status];
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.1em]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

function ActiveSwitch({
  slot,
  pending,
  onRequestOff,
  onTurnOn,
}: {
  slot: TemplateSlot;
  pending: boolean;
  onRequestOff: () => void;
  onTurnOn: () => void;
}) {
  const stored = slot.id !== null;
  const on = slot.isActive;

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[12.5px] font-semibold text-ink-soft">
        Use custom wording
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Use custom wording for ${slot.kind} on ${slot.channel}`}
        disabled={pending || !stored}
        title={stored ? undefined : "Save a version first"}
        onClick={() => (on ? onRequestOff() : onTurnOn())}
        className="relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        style={{
          background: on ? "var(--color-brand)" : "rgba(15, 23, 42, 0.18)",
          outlineColor: "var(--color-brand)",
        }}
      >
        <span
          aria-hidden
          className="inline-block h-[16px] w-[16px] rounded-full bg-white transition-transform"
          style={{ transform: `translateX(${on ? 21 : 3}px)` }}
        />
      </button>
    </div>
  );
}
