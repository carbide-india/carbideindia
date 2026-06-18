"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { COSTING_TYPES, COSTING_TYPE_LABELS } from "@/db/enums";
import { CreateItemSchema } from "@/lib/validators/item";
import { createItem } from "@/app/(app)/items/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";
import type { MasterOptionWithCode } from "@/lib/queries/masters";
import type { InquiryOption } from "@/lib/queries/inquiries";

export type ItemFormValues = z.input<typeof CreateItemSchema>;
type ItemFormOutput = z.output<typeof CreateItemSchema>;

interface Props {
  shapes: MasterOptionWithCode[];
  grades: MasterOptionWithCode[];
  tolerances: MasterOptionWithCode[];
  conditions: MasterOptionWithCode[];
  sizes: MasterOptionWithCode[];
  inquiries: InquiryOption[];
}

/** Size-class options — shown alongside the auto-derived value so user can override. */
const SIZE_CODE_OPTIONS = [
  { value: "S", label: "S — Small" },
  { value: "M", label: "M — Medium" },
  { value: "L", label: "L — Large" },
  { value: "SA", label: "SA — Small Assembly" },
  { value: "MA", label: "MA — Medium Assembly" },
  { value: "LA", label: "LA — Large Assembly" },
  { value: "Sp", label: "Sp — Special" },
  { value: "A", label: "A — Assembly" },
  { value: "P", label: "P — Powder" },
];

/**
 * Item form — live code preview, optional enquiry auto-fill, and all
 * classification + dimension + part-description fields.
 */
export function ItemForm({
  shapes,
  grades,
  tolerances,
  conditions,
  // sizes is used for the sizeCodeById lookup map (live preview dep)
  sizes,
  inquiries,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Build lookup maps for codes (needed for the live preview).
  const shapeCodeById = React.useMemo(
    () => new Map(shapes.map((s) => [s.id, s.code ?? ""])),
    [shapes],
  );
  const gradeCodeById = React.useMemo(
    () => new Map(grades.map((g) => [g.id, g.code ?? g.name])),
    [grades],
  );
  const conditionCodeById = React.useMemo(
    () => new Map(conditions.map((c) => [c.id, c.code ?? ""])),
    [conditions],
  );
  const toleranceCodeById = React.useMemo(
    () => new Map(tolerances.map((t) => [t.id, t.code ?? ""])),
    [tolerances],
  );
  // sizes keyed by code for reference
  const sizeCodeById = React.useMemo(
    () => new Map(sizes.map((s) => [s.id, s.code ?? ""])),
    [sizes],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ItemFormValues, unknown, ItemFormOutput>({
    resolver: zodResolver(CreateItemSchema),
    defaultValues: {
      customerName: "",
      custProductName: "",
      custDrawingNo: "",
      drawingRevisionNo: "",
      dimensionNotes: "",
      gradeCustomer: "",
      gradeNameForCust: "",
      partNo: "",
      partDescription1: "",
      partDescription2: "",
      partDescription3: "",
      partDescription4: "",
      partTag: "",
    },
  });

  // Watch the code-bearing fields so the live preview can update.
  const watchedShapeId = watch("shapeId");
  const watchedGradeId = watch("internalGradeId");
  const watchedConditionId = watch("conditionId");
  const watchedToleranceId = watch("toleranceId");
  const watchedSizeCode = watch("sizeCode");
  const watchedOD = watch("outerDia");
  const watchedID = watch("innerDia");
  const watchedL = watch("length");
  const watchedW = watch("width");
  const watchedT = watch("thickness");

  /** Live item-code preview derived from current form values. */
  const previewCode = React.useMemo(() => {
    const dimVals = [
      watchedOD,
      watchedID,
      watchedL,
      watchedW,
      watchedT,
    ]
      .map((v) => (v !== undefined && v !== null ? Number(v) : NaN))
      .filter((n) => !isNaN(n) && n > 0);

    const sizeCode =
      watchedSizeCode ||
      (dimVals.length > 0 ? deriveSizeCode(dimVals) : "?");

    return buildItemCode({
      sizeCode,
      seq: 0, // placeholder — real serial drawn on save
      shapeCode: watchedShapeId ? (shapeCodeById.get(watchedShapeId) ?? "?") : "?",
      gradeCode: watchedGradeId ? (gradeCodeById.get(watchedGradeId) ?? "?") : "?",
      conditionCode: watchedConditionId
        ? (conditionCodeById.get(watchedConditionId) ?? "?")
        : "?",
      toleranceCode: watchedToleranceId
        ? (toleranceCodeById.get(watchedToleranceId) ?? "XXX")
        : "XXX",
      dims: dimVals,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedShapeId,
    watchedGradeId,
    watchedConditionId,
    watchedToleranceId,
    watchedSizeCode,
    watchedOD,
    watchedID,
    watchedL,
    watchedW,
    watchedT,
    shapeCodeById,
    gradeCodeById,
    conditionCodeById,
    toleranceCodeById,
    sizeCodeById,
  ]);

  // Replace the "00000" seq placeholder with "(auto)" for display.
  const displayCode = previewCode.replace("-00000-", "-(auto)-");

  /** When user selects an enquiry, auto-fill the snapshot fields. */
  function applyInquiryFill(inquiryId: string) {
    const inq = inquiries.find((i) => i.id === inquiryId);
    if (!inq) return;
    setValue("inquiryId", inq.id);
    setValue("smNumber", inq.smNumber);
    setValue("customerName", inq.companyName);
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createItem(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: res.reused
          ? `Item already existed: ${res.itemCode}`
          : `Item ${res.itemCode} created`,
        type: "success",
      });
      router.push("/items" as Route);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as string | undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── Live code preview chip ─────────────────────────────────── */}
      <div
        className="inline-flex items-center gap-3 self-start rounded-chip border border-hairline px-4 py-2.5"
        style={{ background: "color-mix(in srgb, var(--color-brand) 6%, white)" }}
      >
        <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-subtle">
          Preview
        </span>
        <span
          className="font-bold tracking-tight text-ink-strong"
          style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}
        >
          {displayCode}
        </span>
      </div>

      {/* ── 1 · Source Enquiry ───────────────────────────────────── */}
      <SectionCard
        title="Source Enquiry"
        hint="Optional — pick an enquiry to auto-fill customer and SM number."
      >
        <Field id="item-inquiry" label="From Enquiry" labelOnly>
          <Controller
            control={control}
            name="inquiryId"
            render={({ field }) => (
              <Select
                id="item-inquiry"
                value={field.value ?? ""}
                onValueChange={(v) => {
                  field.onChange(v || undefined);
                  if (v) applyInquiryFill(v);
                }}
                placeholder="Select an enquiry…"
                searchable
                searchPlaceholder="Search by SM number or company…"
                options={[
                  { value: "", label: "— None —" },
                  ...inquiries.map((i) => ({
                    value: i.id,
                    label: `${i.smNumber} — ${i.companyName}`,
                  })),
                ]}
              />
            )}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-sm" label="SM Number">
            <input
              id="item-sm"
              type="text"
              className="nt-input"
              placeholder="e.g. SM9600"
              {...register("smNumber")}
            />
          </Field>
          <Field id="item-customer" label="Customer Name">
            <input
              id="item-customer"
              type="text"
              className="nt-input"
              placeholder="Company name"
              {...register("customerName")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-product" label="Customer Product Name">
            <input
              id="item-product"
              type="text"
              className="nt-input"
              {...register("custProductName")}
            />
          </Field>
          <Field id="item-drawing" label="Customer Drawing No">
            <input
              id="item-drawing"
              type="text"
              className="nt-input"
              {...register("custDrawingNo")}
            />
          </Field>
          <Field id="item-rev" label="Drawing Revision No">
            <input
              id="item-rev"
              type="text"
              className="nt-input"
              {...register("drawingRevisionNo")}
            />
          </Field>
          <Field id="item-qty" label="Quantity">
            <input
              id="item-qty"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              {...register("qty")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Classification ───────────────────────────────────── */}
      <SectionCard
        title="Classification"
        hint="These fields drive the internal item code — required for the code to be meaningful."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-shape" label="Shape" labelOnly>
            <Controller
              control={control}
              name="shapeId"
              render={({ field }) => (
                <Select
                  id="item-shape"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select shape…"
                  searchable
                  options={shapes.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.code ? ` (${s.code})` : ""}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field id="item-grade" label="Internal Grade" labelOnly>
            <Controller
              control={control}
              name="internalGradeId"
              render={({ field }) => (
                <Select
                  id="item-grade"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select grade…"
                  searchable
                  options={grades.map((g) => ({
                    value: g.id,
                    label: g.name,
                  }))}
                />
              )}
            />
          </Field>

          <Field id="item-condition" label="Condition" labelOnly>
            <Controller
              control={control}
              name="conditionId"
              render={({ field }) => (
                <Select
                  id="item-condition"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select condition…"
                  searchable
                  options={conditions.map((c) => ({
                    value: c.id,
                    label: `${c.name}${c.code ? ` (${c.code})` : ""}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field id="item-tolerance" label="Tolerance" labelOnly>
            <Controller
              control={control}
              name="toleranceId"
              render={({ field }) => (
                <Select
                  id="item-tolerance"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select tolerance (or leave XXX)…"
                  searchable
                  options={tolerances.map((t) => ({
                    value: t.id,
                    label: `${t.name}${t.code ? ` (${t.code})` : ""}`,
                  }))}
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-size" label="Size Class (optional — auto-derived from dims)" labelOnly>
            <Controller
              control={control}
              name="sizeCode"
              render={({ field }) => (
                <Select
                  id="item-size"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Auto from dimensions…"
                  options={[{ value: "", label: "— Auto —" }, ...SIZE_CODE_OPTIONS]}
                />
              )}
            />
          </Field>

          <Field id="item-costing" label="Costing Type" labelOnly>
            <Controller
              control={control}
              name="costingType"
              render={({ field }) => (
                <Select
                  id="item-costing"
                  value={field.value ?? ""}
                  onValueChange={(v) =>
                    field.onChange(v ? (v as typeof COSTING_TYPES[number]) : undefined)
                  }
                  placeholder="Select costing type…"
                  options={COSTING_TYPES.map((ct) => ({
                    value: ct,
                    label: COSTING_TYPE_LABELS[ct],
                  }))}
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-grade-cust" label="Grade (Customer)">
            <input
              id="item-grade-cust"
              type="text"
              className="nt-input"
              placeholder="Customer's grade designation"
              {...register("gradeCustomer")}
            />
          </Field>
          <Field id="item-grade-name-cust" label="Grade Name for Customer">
            <input
              id="item-grade-name-cust"
              type="text"
              className="nt-input"
              placeholder="How we present the grade"
              {...register("gradeNameForCust")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Dimensions ───────────────────────────────────────── */}
      <SectionCard
        title="Dimensions"
        hint="All values in mm. Outer Dia / Inner Dia / Length / Width / Thickness — leave blank if not applicable."
      >
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1">
          <Field id="item-od" label="Outer Dia (mm)">
            <input
              id="item-od"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              placeholder="0.00"
              {...register("outerDia")}
            />
          </Field>
          <Field id="item-id" label="Inner Dia (mm)">
            <input
              id="item-id"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              placeholder="0.00"
              {...register("innerDia")}
            />
          </Field>
          <Field id="item-length" label="Length (mm)">
            <input
              id="item-length"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              placeholder="0.00"
              {...register("length")}
            />
          </Field>
          <Field id="item-width" label="Width (mm)">
            <input
              id="item-width"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              placeholder="0.00"
              {...register("width")}
            />
          </Field>
          <Field id="item-thickness" label="Thickness (mm)">
            <input
              id="item-thickness"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              placeholder="0.00"
              {...register("thickness")}
            />
          </Field>
        </div>
        <Field id="item-dim-notes" label="Dimension Notes">
          <textarea
            id="item-dim-notes"
            rows={2}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Special notes about dimensions…"
            {...register("dimensionNotes")}
          />
        </Field>
      </SectionCard>

      {/* ── 4 · Part Details ──────────────────────────────────────── */}
      <SectionCard
        title="Part Details"
        hint="Part number, tag, and up to four description lines for quotation inserts."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="item-part-no" label="Part No">
            <input
              id="item-part-no"
              type="text"
              className="nt-input"
              placeholder="e.g. P-1024"
              {...register("partNo")}
            />
          </Field>
          <Field id="item-part-tag" label="Part Tag">
            <input
              id="item-part-tag"
              type="text"
              className="nt-input"
              placeholder="Tag / reference label"
              {...register("partTag")}
            />
          </Field>
        </div>
        <Field id="item-desc1" label="Part Description 1">
          <input
            id="item-desc1"
            type="text"
            className="nt-input"
            {...register("partDescription1")}
          />
        </Field>
        <Field id="item-desc2" label="Part Description 2">
          <input
            id="item-desc2"
            type="text"
            className="nt-input"
            {...register("partDescription2")}
          />
        </Field>
        <Field id="item-desc3" label="Part Description 3">
          <input
            id="item-desc3"
            type="text"
            className="nt-input"
            {...register("partDescription3")}
          />
        </Field>
        <Field id="item-desc4" label="Part Description 4">
          <input
            id="item-desc4"
            type="text"
            className="nt-input"
            {...register("partDescription4")}
          />
        </Field>
      </SectionCard>

      {(serverError ?? firstFieldError) && (
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
          {pending ? "Creating…" : "Create Item"}
        </button>
      </div>
    </form>
  );
}
