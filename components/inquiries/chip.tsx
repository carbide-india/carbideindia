import type { InquiryPriority } from "@/db/enums";

/**
 * Read-only status pill on the shared colour-token system - same color-mix
 * treatment as the tasks table's InlineStatusCell. `tone` is a status colour
 * token name (globals.css `--color-*`). Shared by the inquiry register table
 * and the inquiry detail page.
 */
export function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-pill text-[12px] font-bold whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

/** Priority chips reuse the status colour tokens (globals.css --color-*). */
export const PRIORITY_TONES: Record<InquiryPriority, string> = {
  high_profile: "purple",
  critical: "red",
  urgent: "orange",
  important: "amber",
  normal: "slate",
};
