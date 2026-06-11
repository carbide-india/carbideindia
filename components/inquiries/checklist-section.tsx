"use client";

import * as React from "react";
import { Controller, type Control, type UseFormRegister } from "react-hook-form";
import { Check } from "lucide-react";
import {
  CHECK_STATES,
  CHECK_STATE_LABELS,
  QUANTITY_UOMS,
  DOC_GIVEN_OPTIONS,
  INQUIRY_SHAPES,
} from "@/db/enums";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Field, SectionCard, Segmented } from "./form-field";
import type { InquiryFormValues } from "./inquiry-form";
import type { MasterOptionItem } from "@/lib/queries/masters";

const CHECK_OPTIONS = CHECK_STATES.map((s) => ({
  value: s,
  label: CHECK_STATE_LABELS[s],
}));

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

/** Empty number inputs must reach zod as `undefined`, never NaN or "". */
export function toOptionalNumber(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

interface Props {
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
  productDescriptionError?: string;
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
}

/**
 * Section 3 of the New Inquiry form — Product & Checklist. The paper enquiry
 * checklist's V / x / # marks become Given / Not Given / Assumed segmented
 * controls; everything is optional except the product description.
 */
export function ChecklistSection({
  control,
  register,
  productDescriptionError,
  grades,
  tolerances,
  conditions,
}: Props) {
  return (
    <SectionCard
      title="Product & Checklist"
      hint="Mark what the client actually gave (Given), didn't give (Not Given), or what we filled in ourselves (Assumed)."
    >
      <Field id="inq-product" label="Product Description" required>
        <textarea
          id="inq-product"
          rows={3}
          className="nt-input resize-y"
          style={{ fontWeight: 400 }}
          placeholder="What the client is asking for, in their words…"
          {...register("productDescription")}
        />
        {productDescriptionError && (
          <p className="text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
            {productDescriptionError}
          </p>
        )}
      </Field>

      {/* Quantity row — status mark + nos + UOM */}
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Quantity — Status">
          <Controller
            control={control}
            name="quantityStatus"
            render={({ field }) => (
              <Segmented
                options={CHECK_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Quantity status"
              />
            )}
          />
        </Field>
        <Field id="inq-qty-nos" label="Quantity (Nos)">
          <input
            id="inq-qty-nos"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            placeholder="e.g. 500"
            {...register("quantityNos", { setValueAs: toOptionalNumber })}
          />
        </Field>
        <Field id="inq-qty-uom" label="UOM">
          <Controller
            control={control}
            name="quantityUom"
            render={({ field }) => (
              <Select
                id="inq-qty-uom"
                value={field.value ?? "Nos"}
                onValueChange={field.onChange}
                options={QUANTITY_UOMS.map((u) => ({ value: u, label: u }))}
              />
            )}
          />
        </Field>
      </div>

      {/* Docs given — checkbox chip group */}
      <Field label="Docs Given">
        <Controller
          control={control}
          name="docsGiven"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {DOC_GIVEN_OPTIONS.map((opt) => {
                const selected = field.value ?? [];
                const checked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() =>
                      field.onChange(
                        checked
                          ? selected.filter((o) => o !== opt)
                          : [...selected, opt],
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-2 rounded-chip border px-3 py-2 text-[13px] font-semibold transition-colors",
                      checked
                        ? "border-brand bg-brand/8 text-ink-strong"
                        : "border-hairline bg-surface-card text-ink-muted hover:border-hairline-strong hover:text-ink-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-[16px] items-center justify-center rounded-[4px] border transition-colors",
                        checked
                          ? "bg-brand border-brand text-white"
                          : "border-hairline-strong bg-white text-transparent",
                      )}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        />
      </Field>

      {/* The four paper-checklist check marks */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 max-md:grid-cols-1">
        <Field label="Shape & Dimension — Check">
          <Controller
            control={control}
            name="shapeDimensionCheck"
            render={({ field }) => (
              <Segmented
                options={CHECK_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Shape and dimension check"
              />
            )}
          />
        </Field>
        <Field label="Grade (Customer) — Check">
          <Controller
            control={control}
            name="gradeCheck"
            render={({ field }) => (
              <Segmented
                options={CHECK_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Grade check"
              />
            )}
          />
        </Field>
        <Field label="Tolerance — Check">
          <Controller
            control={control}
            name="toleranceCheck"
            render={({ field }) => (
              <Segmented
                options={CHECK_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Tolerance check"
              />
            )}
          />
        </Field>
        <Field label="Condition — Check">
          <Controller
            control={control}
            name="conditionCheck"
            render={({ field }) => (
              <Segmented
                options={CHECK_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Condition check"
              />
            )}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Sample Received">
          <Controller
            control={control}
            name="sampleReceived"
            render={({ field }) => (
              <Segmented
                options={YES_NO}
                value={
                  field.value === undefined
                    ? undefined
                    : field.value
                      ? "yes"
                      : "no"
                }
                onChange={(v) =>
                  field.onChange(v === undefined ? undefined : v === "yes")
                }
                ariaLabel="Sample received"
              />
            )}
          />
        </Field>
        <Field id="inq-shape" label="Shape">
          <Controller
            control={control}
            name="shape"
            render={({ field }) => (
              <Select
                id="inq-shape"
                value={field.value ?? ""}
                onValueChange={(v) => field.onChange(v || undefined)}
                placeholder="Select a shape…"
                options={INQUIRY_SHAPES.map((s) => ({ value: s, label: s }))}
              />
            )}
          />
        </Field>
      </div>

      {/* Dimensions — all in mm, all optional */}
      <div className="grid grid-cols-5 gap-3 max-md:grid-cols-2">
        <Field id="inq-od" label="Outer Dia">
          <input
            id="inq-od"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            {...register("outerDia", { setValueAs: toOptionalNumber })}
          />
        </Field>
        <Field id="inq-id" label="Inner Dia">
          <input
            id="inq-id"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            {...register("innerDia", { setValueAs: toOptionalNumber })}
          />
        </Field>
        <Field id="inq-len" label="Length">
          <input
            id="inq-len"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            {...register("length", { setValueAs: toOptionalNumber })}
          />
        </Field>
        <Field id="inq-wid" label="Width">
          <input
            id="inq-wid"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            {...register("width", { setValueAs: toOptionalNumber })}
          />
        </Field>
        <Field id="inq-thk" label="Thickness">
          <input
            id="inq-thk"
            type="number"
            min={0}
            step="any"
            className="nt-input"
            {...register("thickness", { setValueAs: toOptionalNumber })}
          />
        </Field>
      </div>

      <Field id="inq-dim-notes" label="Dimension Notes">
        <input
          id="inq-dim-notes"
          type="text"
          className="nt-input"
          placeholder="e.g. as per drawing rev. B, chamfer both ends…"
          {...register("dimensionNotes")}
        />
      </Field>

      {/* Admin-managed masters */}
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <MasterSelect
          control={control}
          name="gradeId"
          label="Grade (Internal)"
          options={grades}
        />
        <MasterSelect
          control={control}
          name="toleranceId"
          label="Tolerance"
          options={tolerances}
        />
        <MasterSelect
          control={control}
          name="conditionId"
          label="Condition"
          options={conditions}
        />
      </div>
    </SectionCard>
  );
}

/**
 * One admin-managed master dropdown. When the master list is empty the
 * select is disabled with an explanatory placeholder; either way a muted
 * hint points at where the options are managed.
 */
function MasterSelect({
  control,
  name,
  label,
  options,
}: {
  control: Control<InquiryFormValues>;
  name: "gradeId" | "toleranceId" | "conditionId";
  label: string;
  options: MasterOptionItem[];
}) {
  const id = `inq-${name}`;
  const empty = options.length === 0;
  return (
    <Field id={id} label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            id={id}
            value={field.value ?? ""}
            onValueChange={(v) => field.onChange(v || undefined)}
            placeholder={empty ? "No options yet" : `Select ${label.toLowerCase()}…`}
            disabled={empty}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
          />
        )}
      />
      <p className="text-[12px] text-ink-subtle">Managed in Admin → Masters</p>
    </Field>
  );
}
