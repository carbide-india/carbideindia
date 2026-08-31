"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { X } from "lucide-react";
import { CreateVendorSchema } from "@/lib/validators/vendor";
import { createVendor } from "@/app/(app)/vendors/actions";
import type { VendorOption } from "@/lib/queries/vendors";
import { fireToast } from "@/lib/toast";
import { NotesField } from "@/components/ui/notes-field";
import { Field } from "@/components/inquiries/form-field";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";

/** RHF holds the schema's input shape; zodResolver hands the parsed output. */
type VendorFormValues = z.input<typeof CreateVendorSchema>;
type VendorFormOutput = z.output<typeof CreateVendorSchema>;

interface Props {
  /** Controls visibility — the modal renders nothing when false. */
  open: boolean;
  /** Close without creating (backdrop, ✕, Esc, or Cancel). */
  onClose: () => void;
  /**
   * Fired once with the freshly-created vendor so the caller (the Buy-Out
   * matrix) can auto-select it. Shaped exactly like a picker {@link VendorOption}.
   */
  onCreated: (vendor: VendorOption) => void;
  /** Optional prefill for the name — e.g. text already typed into the picker. */
  initialName?: string;
}

const BORDER = "#b7bcd2";
const INDIGO = "#3f3f94";

/** Focusable elements for the modal's focus trap (mirrors lib/focus-next). */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Vendor quick-create modal — a compact, keyboard-first form for adding a vendor
 * WITHOUT leaving the costing / Buy-Out flow (the Vendor Master has no standalone
 * page; vendors are created inline). Saves via the existing `createVendor` server
 * action (vendor code auto-generates VN-#### server-side), surfaces validation and
 * server errors inline, and hands the new vendor to `onCreated` so the Buy-Out
 * matrix can select it immediately.
 *
 * Keyboard: Enter advances fields (useKeyboardForm), Ctrl/Cmd+Enter saves, Esc
 * closes. Field patterns mirror components/vendors/vendor-form.tsx.
 */
export function VendorQuickCreateModal({ open, onClose, onCreated, initialName }: Props) {
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLFormElement>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VendorFormValues, unknown, VendorFormOutput>({
    resolver: zodResolver(CreateVendorSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      contactNo: "",
      email: "",
      address: "",
      defaultCreditDays: undefined,
      paymentTerms: "",
      isGstApplicable: true,
      notes: "",
    },
  });

  // Focus restoration: capture whatever was focused when the modal opened (the
  // trigger — e.g. the vendor picker's +Add control) and return focus to it when
  // the modal closes, so a keyboard user lands back where they were rather than at
  // document start. Declared BEFORE the focus-first effect so it captures the real
  // trigger before `#qv-name` steals focus. Cleanup fires on close and on unmount.
  React.useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      trigger?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset to a clean slate (with any prefilled name) and focus the name field
  // each time the modal opens — the component stays mounted while `open` toggles,
  // so a mount-once autofocus wouldn't fire on reopen.
  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset({
      name: initialName ?? "",
      contactPerson: "",
      contactNo: "",
      email: "",
      address: "",
      defaultCreditDays: undefined,
      paymentTerms: "",
      isGstApplicable: true,
      notes: "",
    });
    const first = rootRef.current?.querySelector<HTMLInputElement>("#qv-name");
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createVendor(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${values.name} added.`, type: "success" });
      onCreated({
        id: res.id,
        name: values.name,
        vendorCode: res.vendorCode,
        defaultCreditDays: values.defaultCreditDays ?? null,
        paymentTerms: values.paymentTerms ?? null,
      });
    });
  });

  const { formProps } = useKeyboardForm({ onSubmit: () => void submit() });
  const firstFieldError = Object.values(errors)[0]?.message as string | undefined;

  // Esc closes from anywhere in the modal; Tab / Shift+Tab are trapped so focus
  // cycles within the dialog instead of escaping to the page behind the overlay.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
      (el) =>
        el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        el.getClientRects().length > 0,
    );
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      // Wrap backward: leaving the first control (or focus outside the dialog)
      // loops to the last.
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      // Wrap forward: leaving the last control loops to the first.
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        // Backdrop click (not a click that started inside the panel) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Add vendor"
    >
      <form
        ref={rootRef}
        onSubmit={submit}
        {...formProps}
        noValidate
        className="w-full max-w-[560px] rounded-[16px] bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.4)]"
        style={{ border: `2px solid ${BORDER}` }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between rounded-t-[14px] px-6 py-4"
          style={{ borderBottom: `2px solid ${BORDER}` }}
        >
          <div className="flex flex-col">
            <h2 className="text-[17px] font-extrabold tracking-tight" style={{ color: INDIGO }}>
              Add Vendor
            </h2>
            <p className="text-[12.5px] text-[#6b7280]">
              A vendor code (VN-####) is assigned automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-90"
          >
            <X className="h-[19px] w-[19px]" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <Field id="qv-name" label="Vendor Name" required>
            <input
              id="qv-name"
              type="text"
              required
              className="nt-input"
              placeholder="e.g. Sandvik Hard Materials"
              {...register("name")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <Field id="qv-contact-person" label="Contact Person">
              <input
                id="qv-contact-person"
                type="text"
                className="nt-input"
                placeholder="e.g. Rahul Sharma"
                {...register("contactPerson")}
              />
            </Field>
            <Field id="qv-contact-no" label="Contact No.">
              <input
                id="qv-contact-no"
                type="tel"
                className="nt-input"
                placeholder="e.g. +91 98765 43210"
                {...register("contactNo")}
              />
            </Field>
          </div>

          <Field id="qv-email" label="Email">
            <input
              id="qv-email"
              type="email"
              className="nt-input"
              placeholder="e.g. sales@sandvik.com"
              {...register("email")}
            />
          </Field>

          <Field id="qv-address" label="Address">
            <Controller
              control={control}
              name="address"
              render={({ field }) => (
                <NotesField
                  id="qv-address"
                  rows={2}
                  placeholder="Street, city, state, pin"
                  value={typeof field.value === "string" ? field.value : ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <Field id="qv-credit-days" label="Default Credit Days">
              <input
                id="qv-credit-days"
                type="number"
                min={0}
                max={3650}
                step={1}
                className="nt-input"
                placeholder="e.g. 30"
                {...register("defaultCreditDays", {
                  setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
                })}
              />
            </Field>
            <Field id="qv-payment-terms" label="Payment Terms">
              <input
                id="qv-payment-terms"
                type="text"
                className="nt-input"
                placeholder="e.g. 50% advance"
                {...register("paymentTerms")}
              />
            </Field>
          </div>

          {/* GST Applicable toggle — default on. */}
          <Field id="qv-gst" label="GST Applicable" labelOnly>
            <Controller
              control={control}
              name="isGstApplicable"
              render={({ field }) => {
                const on = field.value !== false;
                return (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label="GST Applicable"
                    onClick={() => field.onChange(!on)}
                    className="inline-flex items-center gap-3 self-start rounded-[10px] px-1 py-1"
                  >
                    <span
                      className="relative inline-flex h-[26px] w-[46px] items-center rounded-full transition-colors"
                      style={{ background: on ? INDIGO : "#c7ccdb" }}
                    >
                      <span
                        className="inline-block h-[20px] w-[20px] rounded-full bg-white shadow transition-transform"
                        style={{ transform: on ? "translateX(23px)" : "translateX(3px)" }}
                      />
                    </span>
                    <span className="text-[14px] font-semibold text-[#3a4152]">
                      {on ? "Yes — GST applies" : "No — non-GST vendor"}
                    </span>
                  </button>
                );
              }}
            />
          </Field>

          <Field id="qv-notes" label="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <NotesField
                  id="qv-notes"
                  rows={2}
                  placeholder="Anything worth remembering about this vendor"
                  value={typeof field.value === "string" ? field.value : ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>

          {(serverError || firstFieldError) && (
            <p className="font-semibold" style={{ fontSize: 13.5, color: "#D32F2F" }}>
              {serverError ?? firstFieldError}
            </p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-end gap-3 rounded-b-[14px] px-6 py-4"
          style={{ borderTop: `2px solid ${BORDER}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-chip px-5 py-3 text-[14px] font-bold text-[#3a4152] transition hover:bg-[#eef0f5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="text-cta rounded-chip px-7 py-3 text-white transition-transform disabled:opacity-50"
            style={{
              background: "#454595",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            {pending ? "Saving" : "Add Vendor"}
          </button>
        </div>
      </form>
    </div>
  );
}
