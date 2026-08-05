"use client";

import type { ReactNode } from "react";
import { DOC_NUMBER_STRATEGY_LABELS, type DocNumberStrategy } from "@/db/enums";

/**
 * Small shared presentational pieces for Admin → Document Numbering.
 * Kept in one place so the register table and the manage dialog can never
 * drift apart on how a strategy or a preview number is rendered.
 */

/** Human label for a `doc_number_formats.module` value (plain text column). */
const MODULE_LABELS: Record<string, string> = {
  sales: "Sales",
  masters: "Masters",
  production: "Production",
  quality: "Quality",
  dispatch: "Dispatch",
  accounts: "Accounts",
  admin: "Administration",
};

export function moduleLabel(module: string): string {
  return (
    MODULE_LABELS[module] ??
    module.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const STRATEGY_TONE: Record<DocNumberStrategy, "blue" | "green" | "purple"> = {
  fy_series: "blue",
  sequence: "green",
  sm_suffix: "purple",
};

/** One-line explanation of a strategy, shown in the dialog and the legend. */
export const STRATEGY_BLURB: Record<DocNumberStrategy, string> = {
  fy_series:
    "A gapless counter row per financial year in doc_number_series, incremented inside the document's own transaction so a rollback never burns a number.",
  sequence:
    "A Postgres SEQUENCE consumed by the column default. Fast but not gapless — a rolled-back insert permanently skips its number.",
  sm_suffix:
    "Derived from the parent SM number when the row is inserted (SM9601-Q01). There is no counter to edit — the suffix is the count of siblings.",
};

export function StrategyBadge({ strategy }: { strategy: DocNumberStrategy }) {
  const tone = STRATEGY_TONE[strategy];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `var(--color-${tone})` }}
      />
      {DOC_NUMBER_STRATEGY_LABELS[strategy]}
    </span>
  );
}

/**
 * The live preview of the next number. `aria-live="polite"` because it updates
 * as the admin types a prefix in the manage dialog.
 */
export function PreviewPill({
  value,
  size = "sm",
  live = false,
}: {
  value: string;
  size?: "sm" | "lg";
  live?: boolean;
}) {
  return (
    <span
      {...(live ? { "aria-live": "polite" as const } : {})}
      className="inline-block rounded-chip font-mono font-bold tabular-nums"
      style={{
        background: "color-mix(in srgb, var(--color-brand) 8%, transparent)",
        color: "var(--color-brand-deep)",
        border: "1px solid color-mix(in srgb, var(--color-brand) 20%, transparent)",
        padding: size === "lg" ? "6px 12px" : "3px 8px",
        fontSize: size === "lg" ? 16 : 13,
        letterSpacing: "-0.01em",
      }}
    >
      {value}
    </span>
  );
}

/** Neutral "this value comes from code" marker used on read-only fields. */
export function CodeOwnedNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-[12.5px] leading-snug text-ink-subtle">{children}</p>
  );
}
