"use client";

import { useEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

/**
 * Shared chrome for the Currency & Credit admin screens. Same visual language
 * as components/admin/settings-form.tsx (hairline card, uppercase legend,
 * brand focus glow) — kept local so the settings form stays untouched.
 */

export function CurrencySection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CurrencyField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[14px] font-semibold text-ink-strong mb-1.5"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p
          className="mt-1.5 text-[13px] text-ink-subtle"
          style={{ lineHeight: 1.55 }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// React 19 passes `ref` through as an ordinary prop, so spreading `...rest`
// forwards it to the underlying input without forwardRef.
export function CurrencyInput({
  className = "",
  ...rest
}: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      {...rest}
      className={`w-full rounded-md border px-3.5 py-2.5 text-[15px] bg-white transition-colors focus:outline-none disabled:opacity-60 ${className}`}
      style={{ borderColor: "var(--color-hairline-strong)" }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--color-brand)";
        e.currentTarget.style.boxShadow =
          "0 0 0 3px color-mix(in srgb, var(--color-brand) 14%, transparent)";
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--color-hairline-strong)";
        e.currentTarget.style.boxShadow = "none";
        rest.onBlur?.(e);
      }}
    />
  );
}

export type ChipTone = "green" | "amber" | "red" | "blue" | "neutral";

const CHIP_STYLE: Record<ChipTone, { bg: string; fg: string; dot: string }> = {
  green: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", dot: "var(--color-green)" },
  amber: { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)", dot: "var(--color-amber)" },
  red: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)", dot: "var(--color-red)" },
  blue: { bg: "var(--color-blue-bg)", fg: "var(--color-blue-deep)", dot: "var(--color-blue)" },
  neutral: { bg: "rgba(15, 23, 42, 0.05)", fg: "var(--color-ink-subtle)", dot: "var(--color-ink-subtle)" },
};

export function CurrencyChip({
  tone,
  children,
  dot = true,
}: {
  tone: ChipTone;
  children: ReactNode;
  dot?: boolean;
}) {
  const s = CHIP_STYLE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      )}
      {children}
    </span>
  );
}

/** Primary (brand) button used by every dialog's confirm slot. */
export function CurrencyPrimaryButton({
  className = "",
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-50 transition-transform hover:-translate-y-px disabled:hover:translate-y-0 ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
        boxShadow: "0 8px 22px -12px rgba(63, 63, 148, 0.55)",
        ...style,
      }}
    />
  );
}

export function CurrencyGhostButton({
  className = "",
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{ outlineColor: "var(--color-brand)", ...style }}
    />
  );
}

/**
 * Explicit confirm step for anything irreversible or bulk. Radix handles focus
 * trapping; we additionally park initial focus on Cancel so a stray Enter can
 * never fire the destructive path.
 */
export function CurrencyConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  error,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending: boolean;
  error?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg max-h-[calc(100dvh-32px)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-[14.5px] text-[#64748B] mb-4" style={{ lineHeight: 1.55 }}>
            {description}
          </Dialog.Description>
          {children}
          {error && <AdminInlineError className="mt-4">{error}</AdminInlineError>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="px-4 py-2.5 text-[14px] font-medium text-[#64748B] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{
                background: destructive
                  ? "#D32F2F"
                  : "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
              }}
            >
              {pending ? "Working" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
