import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StatusPill (ERP redesign — Phase 3).
 *
 * ONE chip that unifies the ad-hoc status chips scattered across the app
 * (active/inactive item badges, draft/archived markers, pipeline-stage states,
 * task/enquiry tones). It is purely presentational and tone-driven: the caller
 * passes a `tone` token that resolves to the existing palette CSS variables
 * (`--color-<tone>` / `--color-<tone>-bg` / `--color-<tone>-deep`) declared in
 * `app/globals.css` — so status colors still come from one place and admin-set
 * `status_settings` tones can be passed straight through.
 *
 * Server-safe (no "use client"): renders a <span>, no state.
 */

/** The palette tones declared as CSS custom properties in globals.css. */
export type PillTone =
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "rose"
  | "purple"
  | "yellow"
  | "orange"
  | "slate"
  | "brown"
  | "stone"
  | "brand";

export type PillSize = "sm" | "md";

/**
 * The four `item_status` lifecycle values (matches `db/enums.ts` ITEM_STATUSES)
 * mapped to a tone + label. Exported so the Item Workspace and register facets
 * share one source of truth for item-status presentation.
 */
export const ITEM_STATUS_PILL: Record<
  "draft" | "active" | "archived" | "superseded",
  { tone: PillTone; label: string }
> = {
  draft: { tone: "amber", label: "Draft" },
  active: { tone: "green", label: "Active" },
  archived: { tone: "slate", label: "Archived" },
  superseded: { tone: "stone", label: "Superseded" },
};

interface StatusPillProps {
  /** The visible label. */
  children: React.ReactNode;
  /** Palette tone token (default "slate"). Drives dot + text + background. */
  tone?: PillTone;
  /** "md" (default) or "sm" for dense tables. */
  size?: PillSize;
  /** Hide the leading dot (e.g. for stage nodes that carry their own icon). */
  hideDot?: boolean;
  /** Solid tone fill instead of the soft tinted background. */
  solid?: boolean;
  className?: string;
  title?: string;
}

const SIZE_CLASSES: Record<PillSize, string> = {
  sm: "gap-1 px-2 py-0.5 text-[11px]",
  md: "gap-1.5 px-2.5 py-1 text-[12px]",
};

const DOT_SIZE: Record<PillSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
};

export function StatusPill({
  children,
  tone = "slate",
  size = "md",
  hideDot = false,
  solid = false,
  className,
  title,
}: StatusPillProps) {
  const dotColor = `var(--color-${tone})`;
  const style: React.CSSProperties = solid
    ? { background: `var(--color-${tone})`, color: "#fff" }
    : {
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      };

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none whitespace-nowrap",
        SIZE_CLASSES[size],
        className,
      )}
      style={style}
    >
      {!hideDot && (
        <span
          className={cn("shrink-0 rounded-full", DOT_SIZE[size])}
          style={{ background: solid ? "rgba(255,255,255,0.9)" : dotColor }}
        />
      )}
      {children}
    </span>
  );
}
