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
  float,
  invalid,
  hint,
  action,
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
  /**
   * Render the floating-label shell: the label rests inside the box and floats
   * into a notch in the border on focus / once filled. Opt-in while the forms
   * are migrated module by module — the stacked label above stays the default
   * so none of the ~393 existing call sites move until they are converted.
   *
   * Plain text inputs inside a float Field MUST carry `placeholder=" "` (a
   * single space) so the browser can report "empty"; that is what drives the
   * rest → floated transition.
   */
  float?: boolean;
  /**
   * @deprecated No-op. The label is always on the border now — see the
   * `.nt-field-label` note in globals.css. Kept so the ~400 call sites that
   * pass it still compile.
   */
  floatAlways?: boolean;
  /** Paints the outline in the error role. */
  invalid?: boolean;
  /** Muted line rendered under the box (e.g. where options are managed). */
  hint?: React.ReactNode;
  /**
   * Small affordance pinned to the top-right of the outline — mirrors the
   * label on the left. Use for a "+ Add" that creates a dropdown option
   * inline. Keeps the field the same height as its neighbours, which a
   * label-row above the box does not.
   */
  action?: React.ReactNode;
}) {
  if (float) {
    // Convention: the CONTROL is the first child. Anything after it — a
    // validation message, a helper line, a "same as company" shortcut — is
    // stacked under the box rather than left inside the outline, where it
    // used to overlap the border and read as a broken field.
    const [control, ...aside] = React.Children.toArray(children);
    const hasAside = aside.length > 0 || hint != null;
    return (
      <div className={cn("flex flex-col", className)}>
        <div className="nt-field-shell" data-invalid={invalid ? "true" : undefined}>
          <div className="nt-field-body">{control}</div>
          {/* Decorative: cuts the gap the label sits in. The real label is the
              sibling below, so screen readers never see this duplicate. */}
          <fieldset aria-hidden className="nt-field-notch">
            <legend className="nt-field-legend">
              <span>
                {label}
                {required ? " *" : ""}
              </span>
            </legend>
          </fieldset>
          {/* `title` so a label truncated in a narrow column is still readable. */}
          <label
            htmlFor={labelOnly ? undefined : id}
            className="nt-field-label"
            title={label}
          >
            {label}
            {required && <span className="nt-field-req"> *</span>}
          </label>
          {action != null && <div className="nt-field-action">{action}</div>}
        </div>
        {hasAside && (
          <div className="nt-field-aside">
            {aside}
            {hint != null && <p className="text-[12px] text-ink-subtle">{hint}</p>}
          </div>
        )}
      </div>
    );
  }

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
  float,
  invalid,
  hint,
  action,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Floating-label shell — the same one `Field` renders. A form that has
   * converted its `Field`s must convert its `MiniField`s too, or it shows two
   * different label styles side by side (Costing is nearly half MiniField).
   */
  float?: boolean;
  /** @deprecated No-op — the label is always on the border. */
  floatAlways?: boolean;
  /** Paints the outline in the error role. */
  invalid?: boolean;
  /** Muted line rendered under the box. */
  hint?: React.ReactNode;
  /** Small affordance pinned to the top-right of the outline. */
  action?: React.ReactNode;
}) {
  if (float) {
    const [control, ...aside] = React.Children.toArray(children);
    const hasAside = aside.length > 0 || hint != null;
    return (
      <div className={cn("flex flex-col", className)}>
        <div className="nt-field-shell" data-invalid={invalid ? "true" : undefined}>
          <div className="nt-field-body">{control}</div>
          <fieldset aria-hidden className="nt-field-notch">
            <legend className="nt-field-legend">
              <span>{label}</span>
            </legend>
          </fieldset>
          {/* A <span>, never a <label> — MiniField's controls carry their own
              aria-label, so a <label> here would have nothing to bind to. */}
          <span className="nt-field-label" title={label}>
            {label}
          </span>
          {action != null && <div className="nt-field-action">{action}</div>}
        </div>
        {hasAside && (
          <div className="nt-field-aside">
            {aside}
            {hint != null && <p className="text-[12px] text-ink-subtle">{hint}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 13,
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
  /** Extra classes merged onto the container (e.g. a prominent border). */
  className?: string;
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
  className,
}: SegmentedProps<T>) {
  const lg = size === "lg";
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Roving tabindex: the selected option is the single tab stop; if nothing is
  // selected, the first option is. Arrow/Home/End move between options.
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const select = (i: number) => {
    const o = options[i];
    if (!o) return;
    const active = o.value === value;
    if (active) {
      if (allowClear) onChange(undefined);
      return;
    }
    onChange(o.value);
  };

  const focusAndSelect = (i: number) => {
    const n = options.length;
    if (n === 0) return;
    const idx = ((i % n) + n) % n;
    const o = options[idx];
    if (!o) return;
    // Arrow navigation selects the option it moves to (radiogroup semantics),
    // then moves focus to it.
    if (o.value !== value) onChange(o.value);
    btnRefs.current[idx]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(options.length - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        select(i);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        lg
          ? "flex w-full items-stretch gap-1 rounded-xl border-2 border-[#d9dcea] bg-[#f4f5fb] p-1"
          : // flex-wrap + max-w-full so a many-option control (e.g. the five
            // costing buckets) wraps onto a second line instead of overflowing
            // its grid column and colliding with the field beside it.
            "inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-chip border border-hairline bg-surface-soft p-1.5 self-start",
        className,
      )}
      style={lg ? { boxShadow: "0 1px 2px rgba(15,23,42,0.04)" } : undefined}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === tabStopIndex ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded-lg font-semibold transition-colors whitespace-nowrap",
              lg
                ? "flex-1 px-3 py-2.5 text-[14px]"
                : "px-3 py-1.5 text-[13px]",
              active
                ? activeTone === "brand"
                  ? "bg-brand text-white border-[1.5px] border-brand shadow-[0_0_0_3px_rgba(63,63,148,0.25)]"
                  : "bg-brand text-white shadow-sm"
                : lg
                  ? "text-ink-soft hover:bg-white hover:text-ink-strong hover:shadow-sm"
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
