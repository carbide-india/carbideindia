"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CreateVendorSchema } from "@/lib/validators/vendor";
import { createVendor, updateVendor } from "@/app/(app)/vendors/actions";
import { fireToast } from "@/lib/toast";
import { NotesField } from "@/components/ui/notes-field";
import { Select } from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/data/geo";
import { parseGstin, type GstinParse } from "@/lib/data/gst";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import {
  useKeyboardForm,
  useAutofocusFirstField,
} from "@/components/forms/use-keyboard-form";

/** Standard B2B credit periods, rendered as an "already set" dropdown. */
const CREDIT_DAYS_PRESETS = [0, 7, 15, 30, 45, 60, 90, 120] as const;

/** "Does GST apply to this vendor at all?" — the existing isGstApplicable flag. */
const GST_APPLICABLE_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

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
  /** Route prefix for the post-save redirect. Vendors are maintained under the
   *  Forms module at /vendors (the old /costings/vendors routes were removed). */
  basePath?: string;
  /** Payment Terms master options ("already set" values) for the dropdown. The
   *  selected LABEL is stored as text — the BO matrix matches it back to a
   *  master-option id when prefilling a vendor. */
  paymentTermsOptions?: { value: string; label: string }[];
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
  basePath = "/vendors",
  paymentTermsOptions = [],
}: Props) {
  const isEdit = Boolean(editVendorId);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const stateOptions = React.useMemo(
    () => INDIAN_STATES.map((s) => ({ value: s, label: s })),
    [],
  );
  const creditDaysOptions = React.useMemo(
    () =>
      CREDIT_DAYS_PRESETS.map((n) => ({
        value: String(n),
        label: n === 0 ? "Advance (0 days)" : `${n} days`,
      })),
    [],
  );

  const rootRef = React.useRef<HTMLFormElement>(null);
  useAutofocusFirstField(rootRef);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VendorFormValues, unknown, VendorFormOutput>({
    resolver: zodResolver(CreateVendorSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      contactNo: "",
      email: "",
      address: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      city: "",
      state: "",
      pinCode: "",
      defaultCreditDays: undefined,
      paymentTerms: "",
      isGstApplicable: true,
      gstin: "",
      website: "",
      notes: "",
      ...initialValues,
    },
  });

  // ── GSTIN, exactly as the client KYC form models it ──
  // Same control, same `parseGstin` checker (lib/data/gst.ts): normalize while
  // typing (uppercase, strip spaces/hyphens on paste), then show the decoded
  // state + PAN so a wrong number is obvious before it is saved. Nothing is
  // auto-filled from it here — a vendor's registered state and its postal
  // address are separately entered facts, and silently overwriting the address
  // the user typed would be worse than leaving it alone.
  const [gstParse, setGstParse] = React.useState<GstinParse>(() =>
    parseGstin(String(initialValues?.gstin ?? "")),
  );

  function handleGstinChange(raw: string) {
    const parse = parseGstin(raw);
    setGstParse(parse);
    setValue("gstin", parse.normalized, { shouldDirty: true });
  }

  // "GST applicable = No" means the vendor has no GST number to hold; flipping
  // the toggle locks and clears the input, and the server enforces the same
  // rule for anything that bypasses this form.
  const gstApplicable = useWatch({ control, name: "isGstApplicable" }) !== false;

  function handleGstApplicableChange(next: boolean) {
    setValue("isGstApplicable", next, { shouldDirty: true });
    if (!next) {
      setValue("gstin", "", { shouldDirty: true });
      setGstParse(parseGstin(""));
    }
  }

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

        {/* Structured postal address. Legacy `address` free-text rides along as
            a hidden field so an old vendor's value survives an edit. */}
        <input type="hidden" {...register("address")} />

        <Field id="vendor-addr-1" label="Address Line 1">
          <input
            id="vendor-addr-1"
            type="text"
            className="nt-input"
            placeholder="e.g. Plot 12, Building / Premises"
            {...register("addressLine1")}
          />
        </Field>
        <Field id="vendor-addr-2" label="Address Line 2">
          <input
            id="vendor-addr-2"
            type="text"
            className="nt-input"
            placeholder="e.g. Street / Road, Area"
            {...register("addressLine2")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field id="vendor-addr-3" label="Address Line 3">
            <input
              id="vendor-addr-3"
              type="text"
              className="nt-input"
              placeholder="e.g. Landmark"
              {...register("addressLine3")}
            />
          </Field>
          <Field id="vendor-addr-4" label="Address Line 4">
            <input
              id="vendor-addr-4"
              type="text"
              className="nt-input"
              placeholder="e.g. Locality"
              {...register("addressLine4")}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Field id="vendor-city" label="City">
            <input
              id="vendor-city"
              type="text"
              className="nt-input"
              placeholder="e.g. Nashik"
              {...register("city")}
            />
          </Field>
          <Field id="vendor-state" label="State" labelOnly>
            <Controller
              control={control}
              name="state"
              render={({ field }) => (
                <Select
                  ariaLabel="State"
                  value={typeof field.value === "string" ? field.value : ""}
                  onValueChange={field.onChange}
                  options={stateOptions}
                  placeholder="Select state"
                  searchable
                  searchPlaceholder="Search state"
                />
              )}
            />
          </Field>
          <Field id="vendor-pincode" label="Pincode">
            <input
              id="vendor-pincode"
              type="text"
              inputMode="numeric"
              className="nt-input tabular-nums"
              placeholder="e.g. 422010"
              {...register("pinCode")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Tax & web ────────────────────────────────────────────── */}
      <SectionCard
        title="GST & Web"
        hint="The vendor's GST number and website. Neither is compulsory."
        inlineHint
      >
        <div className="grid grid-cols-[minmax(0,0.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="vendor-gst-applicable" label="GST Applicable" labelOnly>
            <Controller
              control={control}
              name="isGstApplicable"
              render={({ field }) => (
                <Select
                  ariaLabel="GST applicable"
                  value={field.value === false ? "no" : "yes"}
                  onValueChange={(v) => handleGstApplicableChange(v === "yes")}
                  options={GST_APPLICABLE_OPTIONS.map((o) => ({ ...o }))}
                />
              )}
            />
          </Field>

          <Field id="vendor-gstin" label="GST Number (GSTIN)">
            <Controller
              control={control}
              name="gstin"
              render={({ field }) => (
                <input
                  id="vendor-gstin"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={15}
                  disabled={!gstApplicable}
                  placeholder={
                    gstApplicable ? "27ABCDE1234F1Z5" : "GST not applicable"
                  }
                  className="nt-input font-mono uppercase tracking-wide disabled:opacity-60"
                  value={typeof field.value === "string" ? field.value : ""}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  onBlur={field.onBlur}
                />
              )}
            />
            {gstApplicable && gstParse.status === "valid" && (
              <p className="mt-1 text-[12px] font-semibold text-[#15803d]">
                Valid · {gstParse.stateName}
                {gstParse.pan ? ` · PAN ${gstParse.pan}` : ""}
              </p>
            )}
            {gstApplicable && gstParse.status === "invalid" && (
              <p
                className="mt-1 text-[12px] font-semibold"
                style={{ color: "var(--color-red-deep)" }}
              >
                {gstParse.error}
              </p>
            )}
            {gstApplicable && gstParse.status === "idle" && gstParse.stateName && (
              <p className="mt-1 text-[12px] font-medium text-[#6b7280]">
                {gstParse.stateName} · {15 - gstParse.normalized.length} more
              </p>
            )}
          </Field>

          <Field id="vendor-website" label="Website">
            <input
              id="vendor-website"
              type="text"
              inputMode="url"
              spellCheck={false}
              className="nt-input"
              placeholder="e.g. carbideindia.com (optional)"
              {...register("website")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Commercial terms ─────────────────────────────────────── */}
      <SectionCard
        title="Default Terms"
        hint="Pre-filled into the bought-out costing matrix when this vendor is picked."
        inlineHint
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field id="vendor-credit-days" label="Default Credit Days" labelOnly>
            <Controller
              control={control}
              name="defaultCreditDays"
              render={({ field }) => (
                <Select
                  ariaLabel="Default credit days"
                  value={field.value == null ? "" : String(field.value)}
                  onValueChange={(v) =>
                    field.onChange(v === "" ? undefined : Number(v))
                  }
                  options={creditDaysOptions}
                  placeholder="Select credit period"
                />
              )}
            />
          </Field>
          <Field id="vendor-payment-terms" label="Payment Terms" labelOnly>
            <Controller
              control={control}
              name="paymentTerms"
              render={({ field }) => (
                <Select
                  ariaLabel="Payment terms"
                  value={typeof field.value === "string" ? field.value : ""}
                  onValueChange={field.onChange}
                  options={paymentTermsOptions}
                  placeholder={
                    paymentTermsOptions.length === 0
                      ? "No payment terms in master"
                      : "Select payment terms"
                  }
                  disabled={paymentTermsOptions.length === 0}
                  searchable
                  searchPlaceholder="Search payment terms"
                />
              )}
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
