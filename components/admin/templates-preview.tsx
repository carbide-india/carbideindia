"use client";

import { useMemo, type ReactNode } from "react";
import { Bell, Inbox, Mail } from "lucide-react";
import {
  KIND_LABELS,
  renderTemplate,
  sampleValuesForKind,
  type NotificationKind,
  type TemplateChannel,
} from "@/lib/templates/catalogue";

interface Props {
  kind: NotificationKind;
  channel: TemplateChannel;
  subject: string;
  body: string;
}

/** Anything still wrapped in braces after substitution never resolved. */
const LEFTOVER_RE = /(\{\{[^}]*\}\})/g;

/**
 * Splits rendered text so unresolved placeholders can be tinted red.  With
 * sample values supplied for every catalogue token, a leftover is always a
 * typo — showing it in situ is faster than reading a validation list.
 */
function highlight(text: string): ReactNode[] {
  return text.split(LEFTOVER_RE).map((part, i) =>
    part.startsWith("{{") && part.endsWith("}}") ? (
      <mark
        key={i}
        className="rounded px-1 font-semibold"
        style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Live preview of the wording currently in the editor, rendered with the
 * catalogue's sample values and wrapped in chrome that matches how the
 * message actually arrives on each channel.
 */
export function TemplatesPreview({ kind, channel, subject, body }: Props) {
  const { renderedSubject, renderedBody } = useMemo(() => {
    const samples = sampleValuesForKind(kind);
    return {
      renderedSubject: renderTemplate(subject, samples),
      renderedBody: renderTemplate(body, samples),
    };
  }, [kind, subject, body]);

  return (
    <section aria-label="Live preview" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Live preview
        </h3>
        <span className="text-[11.5px] text-ink-subtle">Sample data</span>
      </div>

      {channel === "email" && (
        <EmailChrome subject={renderedSubject} body={renderedBody} />
      )}
      {channel === "web_push" && (
        <PushChrome title={renderedSubject} body={renderedBody} />
      )}
      {channel === "inbox" && (
        <InboxChrome kind={kind} title={renderedSubject} body={renderedBody} />
      )}
    </section>
  );
}

function EmailChrome({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline-strong bg-[#FAFBFC]">
      <div className="flex items-center gap-2 border-b border-hairline bg-white px-4 py-2.5">
        <Mail aria-hidden size={14} className="shrink-0 text-ink-subtle" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink-strong">
            {highlight(subject) as ReactNode[]}
          </div>
          <div className="truncate text-[11.5px] text-ink-subtle">
            Carbide India WMS &lt;notifications@carbideindia.com&gt;
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-[3px] text-[10px] font-semibold tracking-[0.05em] text-white"
              style={{ background: "var(--color-red)" }}
            >
              CARBIDE
            </span>
            <span className="text-[13px] font-semibold text-ink-strong">
              Carbide India WMS
            </span>
          </div>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-strong">
            {highlight(body) as ReactNode[]}
          </p>
        </div>
      </div>
    </div>
  );
}

function PushChrome({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-hairline-strong bg-[#0F172A] p-4">
      <div className="flex items-start gap-3 rounded-xl bg-white/95 p-3 shadow-lg">
        <span
          className="mt-[2px] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: "var(--color-brand)" }}
        >
          <Bell aria-hidden size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-semibold text-ink-strong">
            {highlight(title) as ReactNode[]}
          </div>
          <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-soft">
            {highlight(body) as ReactNode[]}
          </div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle">
            wms.carbideindia.com · now
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxChrome({
  kind,
  title,
  body,
}: {
  kind: NotificationKind;
  title: string;
  body: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline-strong bg-white">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-soft px-4 py-2.5">
        <Inbox aria-hidden size={14} className="text-ink-subtle" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Notifications
        </span>
      </div>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span
          aria-hidden
          className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--color-brand)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink-strong">
            {highlight(title) as ReactNode[]}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-soft">
            {highlight(body) as ReactNode[]}
          </div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle">
            {KIND_LABELS[kind]} · just now
          </div>
        </div>
      </div>
    </div>
  );
}
