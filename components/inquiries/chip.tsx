import type { InquiryPriority } from "@/db/enums";

/**
 * Read-only status pill on the shared colour-token system - same color-mix
 * treatment as the tasks table's InlineStatusCell. `tone` is a status colour
 * token name (globals.css `--color-*`). Shared by the inquiry register table
 * and the inquiry detail page.
 */
export function Chip({
  label,
  tone,
  sizer,
}: {
  label: string;
  tone: string;
  /**
   * The LONGEST label this chip's column can show. When given, every chip in
   * the column is padded to that label's rendered width (an invisible ghost of
   * `sizer` sets the width), so all the status capsules in a column are exactly
   * the same width — font-independent, never clips a long label.
   */
  sizer?: string;
}) {
  const style = {
    background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
    color: `var(--color-${tone}-deep)`,
    border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
  } as const;

  if (sizer) {
    return (
      <span
        className="inline-grid min-w-[76px] place-items-center px-2.5 py-1 rounded-pill text-[12px] font-bold"
        style={style}
      >
        {/* Invisible widest-label ghost, stacked in the same grid cell — it sets
            the width; the visible label centres over it. Both share one cell so
            the height stays a single line. */}
        <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {sizer}
        </span>
        <span className="col-start-1 row-start-1 whitespace-nowrap">{label}</span>
      </span>
    );
  }

  return (
    <span
      // A shared min-width + centred label keeps short status/trade chips
      // (Export / Domestic / Yes / No / priorities) a consistent size instead of
      // each hugging its text; longer labels still grow past it.
      className="inline-flex min-w-[76px] items-center justify-center px-2.5 py-1 rounded-pill text-[12px] font-bold whitespace-nowrap"
      style={style}
    >
      {label}
    </span>
  );
}

/** The longest string in a label map — the `sizer` for a status column's Chips. */
export function longestLabel(labels: Record<string, string>): string {
  let longest = "";
  for (const v of Object.values(labels)) if (v.length > longest.length) longest = v;
  return longest;
}

/** Priority chips reuse the status colour tokens (globals.css --color-*). */
export const PRIORITY_TONES: Record<InquiryPriority, string> = {
  high_profile: "purple",
  critical: "red",
  urgent: "orange",
  important: "amber",
  normal: "slate",
};
