"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbenchTable, type WbColumn } from "./workbench-table";

interface RecordPickerProps<T> {
  open: boolean;
  onClose: () => void;
  onSelect: (row: T) => void;
  title: string;
  rows: T[];
  columns: WbColumn<T>[];
  getRowId: (row: T) => string;
  /** Human label for a row - used for the implicit per-row Select button aria. */
  getRowLabel: (row: T) => string;
}

/**
 * Modal record picker built on WorkbenchTable. A row click - or its Select
 * button - calls `onSelect(row)` then `onClose()`. Closes on overlay click and
 * Escape. Renders null when not open.
 */
export function RecordPicker<T>({
  open,
  onClose,
  onSelect,
  title,
  rows,
  columns,
  getRowId,
  getRowLabel,
}: RecordPickerProps<T>) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function choose(row: T) {
    onSelect(row);
    onClose();
  }

  // Append a trailing "Select" action column over the caller's columns.
  const actionCol: WbColumn<T> = {
    key: "__pick_action",
    header: "",
    align: "right",
    cell: (row) => (
      <button
        type="button"
        aria-label={`Select ${getRowLabel(row)}`}
        onClick={(e) => {
          e.stopPropagation();
          choose(row);
        }}
        className={cn(
          "h-7 px-3 rounded-chip text-[12px] font-semibold text-white bg-brand hover:bg-brand-deep transition-colors",
        )}
      >
        Select
      </button>
    ),
  };
  const allColumns: WbColumn<T>[] = [...columns, actionCol];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-ink-strong/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col rounded-section border border-hairline bg-surface-card shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-hairline bg-brand/[0.06]">
          <span className="flex-1 text-[15px] font-semibold text-ink-strong truncate">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-chip text-ink-soft hover:text-ink-strong hover:bg-surface-soft transition-colors"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <WorkbenchTable
            rows={rows}
            columns={allColumns}
            getRowId={getRowId}
            onRowClick={choose}
            emptyText="No records to choose from."
          />
        </div>
      </div>
    </div>
  );
}

interface PickerFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  onOpen: () => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Read-only, input-looking trigger button for opening a RecordPicker. Shows the
 * chosen value (or placeholder) with a search icon. The caller renders the
 * matching RecordPicker and toggles it via `onOpen`.
 */
export function PickerField({
  label,
  value,
  placeholder = "Select",
  onOpen,
  disabled,
  id,
  className,
}: PickerFieldProps) {
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-[13px] font-medium text-ink-soft"
        >
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={id}
        onClick={onOpen}
        disabled={disabled}
        aria-label={label ? `${label}: ${value || placeholder}` : value || placeholder}
        className={cn(
          "flex w-full items-center gap-2 h-11 px-3.5 rounded-chip border border-hairline bg-surface-card text-[15px] text-left outline-none transition-all",
          "hover:border-hairline-strong focus:border-brand focus:ring-2 focus:ring-brand/25",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className={cn("flex-1 truncate", !value && "text-ink-subtle")}>
          {value || placeholder}
        </span>
        <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      </button>
    </div>
  );
}
