"use client";

import { useRef } from "react";
import { useQueryState } from "nuqs";
import { AlertTriangle } from "lucide-react";
import type { TemplateSlot } from "@/lib/queries/templates";
import {
  KIND_LABELS,
  NOTIFICATION_KINDS,
  TEMPLATE_CHANNELS,
  TEMPLATE_CHANNEL_LABELS,
  isNotificationKind,
  isTemplateChannel,
  type NotificationKind,
  type TemplateChannel,
} from "@/lib/templates/catalogue";
import { SlotStatusChip, TemplatesEditor } from "@/components/admin/templates-editor";

interface Props {
  slots: TemplateSlot[];
  adminEmail: string;
  emailConfigured: boolean;
}

const FIRST_KIND: NotificationKind = "task_assigned";
const FIRST_CHANNEL: TemplateChannel = "email";

/**
 * Master/detail shell for /admin/templates.
 *
 * The grid is fixed at every notification kind × every channel, so the rail is
 * a complete map of what the system can send rather than a list of rows that
 * happen to exist.  Selection lives in the URL (nuqs) so a slot is linkable
 * and the browser Back button walks the edit history.
 */
export function TemplatesWorkbench({ slots, adminEmail, emailConfigured }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const [channel, setChannel] = useQueryState("channel", {
    defaultValue: FIRST_CHANNEL,
    parse: (v): TemplateChannel => (isTemplateChannel(v) ? v : FIRST_CHANNEL),
  });
  const [kind, setKind] = useQueryState("kind", {
    defaultValue: FIRST_KIND,
    parse: (v): NotificationKind => (isNotificationKind(v) ? v : FIRST_KIND),
  });

  const byKey = new Map(slots.map((s) => [s.key, s]));
  const selected =
    byKey.get(`${kind}:${channel}`) ?? byKey.get(`${FIRST_KIND}:${FIRST_CHANNEL}`);

  /** Up/Down moves through the rail without leaving the keyboard. */
  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = NOTIFICATION_KINDS.indexOf(kind);
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const next =
      NOTIFICATION_KINDS[
        (i + delta + NOTIFICATION_KINDS.length) % NOTIFICATION_KINDS.length
      ];
    if (!next) return;
    void setKind(next);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-kind="${next}"]`)
        ?.focus();
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ rail */}
      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="Delivery channel"
          className="flex rounded-lg border border-hairline-strong bg-surface-card p-1"
        >
          {TEMPLATE_CHANNELS.map((c) => {
            const active = c === channel;
            const live = slots.filter(
              (s) => s.channel === c && s.status === "custom",
            ).length;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => void setChannel(c)}
                className="flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  background: active ? "var(--color-brand)" : "transparent",
                  color: active ? "#fff" : "var(--color-ink-soft)",
                  outlineColor: "var(--color-brand)",
                }}
              >
                {TEMPLATE_CHANNEL_LABELS[c]}
                <span className="ml-1 text-[11px] tabular-nums opacity-70">
                  {live}
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={listRef}
          onKeyDown={onListKeyDown}
          className="overflow-hidden rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <div className="border-b border-hairline bg-surface-soft px-4 py-2.5">
            <span
              className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
              style={{ fontFamily: "var(--font-mono-display)" }}
            >
              Events · {TEMPLATE_CHANNEL_LABELS[channel]}
            </span>
          </div>
          <ul>
            {NOTIFICATION_KINDS.map((k) => {
              const slot = byKey.get(`${k}:${channel}`);
              const active = k === kind;
              return (
                <li key={k}>
                  <button
                    type="button"
                    data-kind={k}
                    aria-current={active ? "true" : undefined}
                    onClick={() => void setKind(k)}
                    className="flex w-full items-center gap-2 border-b border-hairline px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2"
                    style={{
                      background: active
                        ? "color-mix(in srgb, var(--color-brand) 8%, transparent)"
                        : undefined,
                      outlineColor: "var(--color-brand)",
                      boxShadow: active
                        ? "inset 3px 0 0 0 var(--color-brand)"
                        : undefined,
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13.5px] font-semibold"
                        style={{
                          color: active
                            ? "var(--color-brand-deep)"
                            : "var(--color-ink-strong)",
                        }}
                      >
                        {KIND_LABELS[k]}
                      </span>
                    </span>
                    {slot?.validationError && (
                      <AlertTriangle
                        aria-label="Placeholder problem"
                        size={13}
                        style={{ color: "var(--color-red)" }}
                        className="shrink-0"
                      />
                    )}
                    {slot && <SlotStatusChip slot={slot} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------- editor */}
      {selected ? (
        <TemplatesEditor
          key={selected.key}
          slot={selected}
          adminEmail={adminEmail}
          emailConfigured={emailConfigured}
        />
      ) : (
        <div
          className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            Nothing to edit here
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-subtle">
            Pick an event from the list on the left.
          </p>
        </div>
      )}
    </div>
  );
}
