"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkbenchPanelProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Collapsible card with a brand-tinted header bar - our clean restyle of the
 * legacy ERP "blue section bar". Click the header to collapse/expand. Body is
 * conditionally rendered (no layout cost while closed).
 */
export function WorkbenchPanel({
  title,
  icon,
  defaultOpen = true,
  children,
  className,
}: WorkbenchPanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section
      className={cn(
        "rounded-section border border-hairline bg-surface-card overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors",
          "bg-brand/[0.06] hover:bg-brand/[0.10] border-b border-hairline",
        )}
      >
        {icon ? (
          <span className="shrink-0 text-brand inline-flex items-center">{icon}</span>
        ) : null}
        <span className="flex-1 text-[15px] font-semibold text-ink-strong truncate">
          {title}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.2}
          className={cn(
            "shrink-0 text-brand transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? <div className="p-4">{children}</div> : null}
    </section>
  );
}
