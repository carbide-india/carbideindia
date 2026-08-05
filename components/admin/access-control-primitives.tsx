import type { ReactNode } from "react";

/**
 * Shared presentational bits for the Access Control page. No "use client"
 * directive on purpose: these are pure and render on whichever side imports
 * them (the page renders some on the server, the tables on the client).
 */

export function AcCard({
  title,
  icon,
  action,
  description,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-section border border-hairline bg-surface-card ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            {icon}
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 text-[13px] text-ink-soft" style={{ lineHeight: 1.55 }}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type AcTone = "green" | "red" | "amber" | "brand" | "muted";

const TONE_STYLE: Record<AcTone, { bg: string; fg: string; dot: string }> = {
  green: {
    bg: "var(--color-green-bg)",
    fg: "var(--color-green-deep)",
    dot: "var(--color-green)",
  },
  red: {
    bg: "var(--color-red-bg)",
    fg: "var(--color-red-deep)",
    dot: "var(--color-red)",
  },
  amber: {
    bg: "var(--color-amber-bg)",
    fg: "var(--color-amber-deep)",
    dot: "var(--color-amber)",
  },
  brand: {
    bg: "rgba(63, 63, 148, 0.08)",
    fg: "var(--color-brand-deep)",
    dot: "var(--color-brand)",
  },
  muted: {
    bg: "rgba(15, 23, 42, 0.05)",
    fg: "var(--color-ink-subtle)",
    dot: "var(--color-ink-subtle)",
  },
};

export function AcPill({
  tone,
  children,
  dot = true,
}: {
  tone: AcTone;
  children: ReactNode;
  dot?: boolean;
}) {
  const s = TONE_STYLE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      )}
      {children}
    </span>
  );
}

/** Monospaced address chip — every IP on this page renders through this. */
export function AcMono({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[13px] font-semibold text-ink-strong tabular-nums"
      style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace" }}
    >
      {children}
    </span>
  );
}

export function AcEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 20, letterSpacing: "-0.015em" }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-2 max-w-md text-[13.5px] text-ink-subtle"
        style={{ lineHeight: 1.55 }}
      >
        {body}
      </p>
    </div>
  );
}

/** Primary (indigo) button — matches the admin save buttons. */
export function AcPrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50 ${rest.className ?? ""}`}
      style={{
        background:
          "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
        boxShadow: "0 6px 18px -10px rgba(63, 63, 148, 0.55)",
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

/** Quiet secondary button used for row actions and dialog cancels. */
export function AcGhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-md border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}
