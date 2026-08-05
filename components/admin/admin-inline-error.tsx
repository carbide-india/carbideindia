import type { ReactNode } from "react";

/**
 * The one inline error box every admin form, dialog and panel renders.
 *
 * No "use client" on purpose: it is pure, so it renders on whichever side
 * imports it. Red is the semantic/error role here - never the brand, which is
 * indigo. `className` carries layout only (e.g. "mt-4"), never colour.
 */
export function AdminInlineError({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#B71C1C] ${className}`.trimEnd()}
    >
      {children}
    </div>
  );
}
