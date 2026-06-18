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
import { Field, SectionCard, Segmented } from "./form-field";
import type { InquiryFormValues } from "./inquiry-form";

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

      {/* Quantity status mark */}
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
    </SectionCard>
  );
}
