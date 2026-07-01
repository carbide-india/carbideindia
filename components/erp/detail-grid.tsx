import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DetailGrid (ERP redesign — Phase 3).
 *
 * The single replacement for the repeated `ReadCard` + `InfoGrid` pattern
 * (`components/items/item-detail.tsx`, the quick-views, client detail, …). A
 * label/value grid that:
 *   - skips empty rows (null / undefined / ""),
 *   - lays out multi-column responsively,
 *   - supports `mono` (tabular monospace for codes/numbers), `href` (linkable
 *     value) and `snapshot` (renders an "as-recorded" marker so users know a
 *     value is a historical snapshot vs a live FK-resolved field — per §12.3).
 *
 * Server-safe (no "use client"). Only the primitive is provided this phase; the
 * Item Workspace is migrated to it as the reference. Other pages migrate later.
 */

export interface DetailField {
  label: string;
  value: React.ReactNode;
  /** Render the value in tabular monospace (codes, quantities, currency). */
  mono?: boolean;
  /** Make the value a link. */
  href?: string;
  /**
   * Mark the value as a frozen "as-recorded" snapshot (historical), not a live
   * FK-resolved field. Renders a small "snapshot" hint next to the label.
   */
  snapshot?: boolean;
  /** Let a single field span the full grid width (long notes, addresses). */
  full?: boolean;
}

interface DetailGridProps {
  fields: ReadonlyArray<DetailField>;
  /** Columns at ≥sm. Defaults to 2. Use 3 for dense reference bodies. */
  columns?: 1 | 2 | 3;
  className?: string;
}

/** True when a value is meaningfully empty and its row should be skipped. */
function isEmpty(v: React.ReactNode): boolean {
  return v === null || v === undefined || v === "";
}

const COLS: Record<1 | 2 | 3, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
};

export function DetailGrid({ fields, columns = 2, className }: DetailGridProps) {
  const visible = fields.filter((f) => !isEmpty(f.value));
  if (visible.length === 0) return null;

  return (
    <dl className={cn("grid grid-cols-1 gap-x-10 gap-y-6", COLS[columns], className)}>
      {visible.map((f) => (
        <div
          key={f.label}
          className={cn("flex flex-col gap-1 min-w-0", f.full && "sm:col-span-full")}
        >
          <dt className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] font-bold text-ink-subtle">
            {f.label}
            {f.snapshot && (
              <span
                className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-ink-subtle"
                style={{ background: "rgba(15,23,42,0.05)" }}
                title="As-recorded snapshot — a historical value, not a live linked field"
              >
                snapshot
              </span>
            )}
          </dt>
          <dd
            className={cn(
              "text-[16px] leading-snug text-ink-strong font-medium break-words",
              f.mono && "font-mono tabular-nums",
            )}
          >
            {f.href ? (
              <a href={f.href} className="text-brand hover:underline">
                {f.value}
              </a>
            ) : (
              f.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
