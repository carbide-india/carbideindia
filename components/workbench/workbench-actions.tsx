"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface WorkbenchActionsProps {
  onClear: () => void;
  onSave: () => void;
  onDelete?: () => void;
  saving?: boolean;
  deleteLabel?: string;
  className?: string;
}

/**
 * Clear / Save / Delete button bar for an operational form.
 * Clear = neutral outline, Save = brand-filled, Delete = red outline.
 * All disabled while `saving`.
 */
export function WorkbenchActions({
  onClear,
  onSave,
  onDelete,
  saving = false,
  deleteLabel = "Delete",
  className,
}: WorkbenchActionsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <button
        type="button"
        onClick={onClear}
        disabled={saving}
        className={cn(
          "h-10 px-4 rounded-chip text-[14px] font-medium transition-all",
          "border border-hairline-strong bg-surface-card text-ink-soft",
          "hover:border-brand/40 hover:text-ink-strong",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        Clear
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn(
          "h-10 px-5 rounded-chip text-[14px] font-semibold text-white transition-all",
          "bg-brand hover:bg-brand-deep",
          "shadow-[0_1px_2px_rgba(15,23,42,0.10)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {saving ? "Saving" : "Save"}
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className={cn(
            "h-10 px-4 rounded-chip text-[14px] font-medium transition-all ml-auto",
            "border border-red/40 text-red bg-surface-card",
            "hover:bg-red/[0.06] hover:border-red/60",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {deleteLabel}
        </button>
      ) : null}
    </div>
  );
}
