"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CreateVendorSchema } from "@/lib/validators/vendor";
import { createVendor, updateVendor } from "@/app/(app)/vendors/actions";
import { fireToast } from "@/lib/toast";
import { NotesField } from "@/components/ui/notes-field";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import {
  useKeyboardForm,
  useAutofocusFirstField,
} from "@/components/forms/use-keyboard-form";

/** RHF holds the schema's input shape; zodResolver hands the parsed output
 *  (blank text folded to `undefined`) to the submit handler. */
export type VendorFormValues = z.input<typeof CreateVendorSchema>;
type VendorFormOutput = z.output<typeof CreateVendorSchema>;

interface Props {
  /** When set, the form saves via updateVendor against this id (edit mode). */
  editVendorId?: string;
  /** Read-only human code shown in edit mode (VN-0001). */
  vendorCode?: string | null;
  /** Prefill for edit mode. */
  initialValues?: Partial<VendorFormValues>;
  /** Route prefix for the post-save redirect — lets the form live at
   *  /costings/vendors (Costing shell) or /vendors (Forms module). */
  basePath?: string;
}

/**
 * Vendor Master form — create + edit, keyboard-first (Enter advances fields via
 * useKeyboardForm; Ctrl/Cmd+Enter submits). Clones the enquiry form's visual
 * language (SectionCard + Field + nt-input), scaled to the vendor fields.
 */
export function VendorForm({
  editVendorId,
  vendorCode,
  initialValues,
  basePath = "/costings/vendors",
}: Props) {
  const isEdit = Boolean(editVendorId);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLFormElement>(null);
  useAutofocusFirstField(rootRef);

  const {
    register,
    control,
    handleSubmit,
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
      notes: "",
      ...initialValues,
    },
  });

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res =
        isEdit && editVendorId
          ? await updateVendor(editVendorId, values)
          : await createVendor(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: isEdit ? "Vendor updated." : `${values.name} added.`,
        type: "success",
      });
      const id = "id" in res ? res.id : editVendorId;
      router.push((id ? `${basePath}/${id}` : basePath) as Route);
      router.refresh();
    });
  });

  const { formProps } = useKeyboardForm({ onSubmit: () => void submit() });
  const firstFieldError = Object.values(errors)[0]?.message as string | undefined;

  return (
    <form ref={rootRef} onSubmit={submit} {...formProps} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Identity ─────────────────────────────────────────────── */}
      <SectionCard
        title="Vendor"
        hint="The supplier's name and how to reach them."
        inlineHint
      >
        {isEdit && vendorCode && (
          <Field id="vendor-code" label="Vendor Code">
            <input
              id="vendor-code"
              type="text"
              readOnly
              disabled
              className="nt-input opacity-70"
              value={vendorCode}
            />
          </Field>
        )}
        <Field id="vendor-name" label="Vendor Name" required>
          <input
            id="vendor-name"
            type="text"
            required
            className="nt-input"
            placeholder="e.g. Sandvik Hard Materials"
            {...register("name")}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="vendor-contact-person" label="Contact Person">
            <input
              id="vendor-contact-person"
              type="text"
              className="nt-input"
              placeholder="e.g. Rahul Sharma"
              {...register("contactPerson")}
            />
          </Field>
          <Field id="vendor-contact-no" label="Contact No.">
            <input
              id="vendor-contact-no"
              type="tel"
              className="nt-input"
              placeholder="e.g. +91 98765 43210"
              {...register("contactNo")}
            />
          </Field>
          <Field id="vendor-email" label="Email">
            <input
              id="vendor-email"
              type="email"
              className="nt-input"
              placeholder="e.g. sales@sandvik.com"
              {...register("email")}
            />
          </Field>
        </div>

        <Field id="vendor-address" label="Address">
          <Controller
            control={control}
            name="address"
            render={({ field }) => (
              <NotesField
                id="vendor-address"
                rows={2}
                placeholder="Street, city, state, pin"
                value={typeof field.value === "string" ? field.value : ""}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Commercial terms ─────────────────────────────────────── */}
      <SectionCard
        title="Default Terms"
        hint="Pre-filled into the bought-out costing matrix when this vendor is picked."
        inlineHint
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field id="vendor-credit-days" label="Default Credit Days">
            <input
              id="vendor-credit-days"
              type="number"
              min={0}
              max={3650}
              step={1}
              className="nt-input"
              placeholder="e.g. 30"
              {...register("defaultCreditDays", {
                setValueAs: (v) =>
                  v === "" || v == null ? undefined : Number(v),
              })}
            />
          </Field>
          <Field id="vendor-payment-terms" label="Payment Terms">
            <input
              id="vendor-payment-terms"
              type="text"
              className="nt-input"
              placeholder="e.g. 50% advance, balance on delivery"
              {...register("paymentTerms")}
            />
          </Field>
        </div>

        <Field id="vendor-notes" label="Notes">
          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <NotesField
                id="vendor-notes"
                rows={3}
                placeholder="Anything worth remembering about this vendor"
                value={typeof field.value === "string" ? field.value : ""}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </SectionCard>

      {(serverError || firstFieldError) && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {serverError ?? firstFieldError}
        </p>
      )}

      <div
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
            boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
        >
          {pending ? "Saving" : isEdit ? "Save Vendor" : "Add Vendor"}
        </button>
      </div>
    </form>
  );
}
