"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the New Inquiry form - cloned from the New Task
 * form's visual language (Field label style, nt-input fields, card sections)
 * so the inquiry module reads as the same app, not a redesign.
 */

export function Field({
  id,
  label,
  required,
  children,
  className,
  labelOnly,
}: {
  id?: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  /**
   * Render the label without `htmlFor`. Use for popover-based selects
   * (ui Select / SearchableSelect): label-click must not toggle the popover,
   * so the control carries an `aria-label` instead of a `for` association.
   */
  labelOnly?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={labelOnly ? undefined : id}
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

/**
 * Smaller sibling of Field for fields nested inside a titled block (e.g. the
 * Sample Register's stage rows): same label voice at 12px so the hierarchy
 * reads stage title > field label > control. Renders a <span>, never a
 * <label> - the controls carry their own aria-labels.
 */
export function MiniField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 12,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Eye-catching header for a repeated group (Contact #1, Product 2, ). A
 * gradient indigo number badge + bold label + a fading accent rule, with an
 * optional right-aligned action (e.g. a Remove button). Shared so contacts and
 * products read as the same visual system.
 */
export function GroupHeader({
  n,
  label,
  action,
  leftAction,
}: {
  n: number;
  label: string;
  action?: React.ReactNode;
  /** Rendered immediately after the label (left side), before the divider. */
  leftAction?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid h-[28px] min-w-[28px] shrink-0 place-items-center rounded-full px-2 text-[12.5px] font-extrabold text-white tabular-nums"
        style={{
          background: "linear-gradient(135deg, #3F3F94 0%, #6d6dcf 100%)",
          boxShadow: "0 3px 8px -2px rgba(63,63,148,0.55)",
        }}
      >
        {n}
      </span>
      <span className="shrink-0 text-[14.5px] font-extrabold tracking-tight text-ink-strong">
        {label}
      </span>
      {leftAction}
      <span
        className="h-[2px] flex-1 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, rgba(63,63,148,0.28) 0%, rgba(63,63,148,0.04) 60%, rgba(63,63,148,0) 100%)",
        }}
      />
      {action}
    </div>
  );
}

/** Card section - same surface treatment as the app's other form cards. */
export function SectionCard({
  title,
  hint,
  children,
  inlineHint,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  /** Render the hint on the same line as the title instead of beneath it. */
  inlineHint?: boolean;
}) {
  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {(title || hint) && (
        <div
          className={cn(
            "mb-5",
            inlineHint && "flex flex-wrap items-baseline gap-x-3 gap-y-1",
          )}
        >
          {title && (
            <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              {title}
            </h2>
          )}
          {hint && (
            <p className={cn("text-[13px] text-ink-subtle", !inlineHint && "mt-1.5")}>
              {hint}
            </p>
          )}
        </div>
      )}
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
  /**
   * "lg" renders a full-width box that matches the height, border and indigo
   * left-accent of `.nt-input` - so it lines up as a proper field alongside
   * the form's other boxes. "sm" (default) is the compact inline pill.
   */
  size?: "sm" | "lg";
  /** "brand" fills the active option with indigo + a prominent focus ring. */
  activeTone?: "default" | "brand";
}

/**
 * Compact segmented control - used for the paper checklist's V / x / # marks
 * (Given / Not Given / Assumed), Yes/No toggles and the New/Old client mode.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  allowClear = true,
  ariaLabel,
  size = "sm",
  activeTone = "default",
}: SegmentedProps<T>) {
  const lg = size === "lg";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        lg
          ? "flex min-h-[54px] w-full items-stretch gap-1.5 rounded-[12px] border-[1.5px] border-[#c3c9db] p-1.5"
          : "inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-surface-soft p-1.5 self-start",
      )}
      style={
        lg
          ? {
              background: "linear-gradient(180deg, #ffffff 0%, #f5f7fa 100%)",
              boxShadow:
                "inset 2px 0 0 rgba(63,63,148,0.32), 0 1px 2px rgba(15,23,42,0.05)",
            }
          : undefined
      }
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
              "rounded-lg font-semibold transition-colors whitespace-nowrap",
              lg
                ? "flex-1 px-3 text-[14px]"
                : "px-3 py-1.5 text-[13px]",
              active
                ? activeTone === "brand"
                  ? "bg-brand text-white border-[1.5px] border-brand shadow-[0_0_0_3px_rgba(63,63,148,0.25)]"
                  : "bg-white text-ink-strong border border-hairline-strong shadow-sm"
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
