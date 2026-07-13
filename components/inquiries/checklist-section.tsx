"use client";

import * as React from "react";
import { Controller, type Control, type UseFormRegister } from "react-hook-form";
import { Check } from "lucide-react";
import {
  CHECK_STATES,
  CHECK_STATE_LABELS,
  DOC_GIVEN_OPTIONS,
} from "@/db/enums";
import { cn } from "@/lib/utils";
import { Field, SectionCard } from "./form-field";
import { Select } from "@/components/ui/select";
import type { InquiryFormValues } from "./inquiry-form";

type CheckState = (typeof CHECK_STATES)[number];

const CHECK_OPTIONS = CHECK_STATES.map((s) => ({
  value: s,
  label: CHECK_STATE_LABELS[s],
}));

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Colour the selected mark so it reads at a glance. */
const CHECK_TEXT_COLOR: Record<CheckState, string> = {
  given: "!text-emerald-700",
  not_given: "!text-[#d32f2f]",
  assumed: "!text-amber-700",
};

/**
 * One checklist mark: a Given / Not Given / Assumed dropdown. When "Assumed"
 * is picked, a follow-up input captures the value we assumed.
 */
function CheckField({
  label,
  name,
  assumedKey,
  control,
  register,
}: {
  label: string;
  name: "quantityStatus" | "shapeDimensionCheck" | "gradeCheck" | "toleranceCheck" | "conditionCheck";
  assumedKey: "quantity" | "shapeDimension" | "grade" | "tolerance" | "condition";
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <Select
              options={CHECK_OPTIONS}
              value={field.value ?? ""}
              onValueChange={(v) => field.onChange((v || undefined) as CheckState | undefined)}
              placeholder="Select"
              className={cn("font-bold", field.value ? CHECK_TEXT_COLOR[field.value] : "")}
            />
            {field.value === "assumed" && (
              <input
                type="text"
                className="nt-input"
                placeholder="What value did you assume?"
                {...register(`assumedValues.${assumedKey}`)}
              />
            )}
          </div>
        )}
      />
    </Field>
  );
}

/** Empty number inputs must reach zod as `undefined`, never NaN or "".
 *  Implementation lives in lib/form-utils; re-exported here for backward compat. */
export { toOptionalNumber } from "@/lib/form-utils";

interface Props {
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
  productDescriptionError?: string;
}

/**
 * Section 4 of the New Inquiry form — Checklist. The paper enquiry checklist's
 * V / x / # marks become Given / Not Given / Assumed segmented controls;
 * everything is optional except the product description. Per-product details
 * (shape, dimensions, masters, quantity) live in the Products section.
 */
export function ChecklistSection({
  control,
  register,
  productDescriptionError,
}: Props) {
  return (
    <SectionCard
      title="Checklist"
      inlineHint
      hint="Mark what the client actually gave (Given), didn't give (Not Given), or what we filled in ourselves (Assumed)."
    >
      <Field id="inq-product" label="Product Description" required>
        <textarea
          id="inq-product"
          rows={3}
          className="nt-input resize-y"
          style={{ fontWeight: 400 }}
          placeholder="What the client is asking for, in their words"
          {...register("productDescription")}
        />
        {productDescriptionError && (
          <p className="text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
            {productDescriptionError}
          </p>
        )}
      </Field>

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
                      "inline-flex items-center gap-2 rounded-chip border-[1.75px] px-3 py-2 text-[13px] font-semibold transition-colors",
                      checked
                        ? "border-brand bg-brand/8 text-ink-strong"
                        : "border-[#9199b6] bg-surface-card text-ink-strong hover:border-[#6f78a0] hover:bg-[#f3f4f8]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-[16px] items-center justify-center rounded-[4px] border-[1.75px] transition-colors",
                        checked
                          ? "bg-brand border-brand text-white"
                          : "border-[#9199b6] bg-white text-transparent",
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

      {/* Checklist marks — compact grid */}
      <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
        <CheckField label="Quantity" name="quantityStatus" assumedKey="quantity" control={control} register={register} />
        <CheckField label="Shape & Dimension" name="shapeDimensionCheck" assumedKey="shapeDimension" control={control} register={register} />
        <CheckField label="Grade" name="gradeCheck" assumedKey="grade" control={control} register={register} />
        <CheckField label="Tolerance" name="toleranceCheck" assumedKey="tolerance" control={control} register={register} />
        <CheckField label="Condition" name="conditionCheck" assumedKey="condition" control={control} register={register} />
        <Field label="Sample Received">
          <Controller
            control={control}
            name="sampleReceived"
            render={({ field }) => (
              <Select
                options={YES_NO}
                value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                onValueChange={(v) => field.onChange(v === "" ? undefined : v === "yes")}
                placeholder="Select"
                className="font-bold"
              />
            )}
          />
        </Field>
      </div>
    </SectionCard>
  );
}
