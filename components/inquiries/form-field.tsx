"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the New Inquiry form — cloned from the New Task
 * form's visual language (Field label style, nt-input fields, card sections)
 * so the inquiry module reads as the same app, not a redesign.
 */

export function Field({
  id,
  label,
  required,
  children,
  className,
}: {
  id?: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 14,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
        {required && <span style={{ color: "#D32F2F" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

/** Card section — same surface treatment as the app's other form cards. */
export function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="mb-5">
        <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
          {title}
        </h2>
        {hint && <p className="text-[13px] text-ink-subtle mt-1.5">{hint}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  /** Clicking the active option clears it (for optional fields). Default true. */
  allowClear?: boolean;
  ariaLabel?: string;
}

/**
 * Compact segmented control — used for the paper checklist's V / x / # marks
 * (Given / Not Given / Assumed), Yes/No toggles and the New/Old client mode.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  allowClear = true,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-surface-soft p-1 self-start"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) {
                if (allowClear) onChange(undefined);
                return;
              }
              onChange(o.value);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap",
              active
                ? "bg-white text-ink-strong border border-hairline-strong shadow-sm"
                : "text-ink-muted hover:text-ink-strong border border-transparent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
