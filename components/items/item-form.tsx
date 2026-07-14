"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { COSTING_TYPES, COSTING_TYPE_LABELS } from "@/db/enums";
import { CreateItemSchema } from "@/lib/validators/item";
import { createItem, updateItem } from "@/app/(app)/items/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/inquiries/form-field";
import { NotesField } from "@/components/ui/notes-field";
import { BackLink } from "@/components/ui/back-link";
import { FoldingSection, useFoldingForm } from "@/components/forms/folding-section";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";
import type { MasterOptionWithCode } from "@/lib/queries/masters";
import {
  DIM_FIELDS,
  DIM_LABELS,
  defaultShapeConfig,
  type DimField,
  type ShapeConfig,
} from "@/lib/masters/shape-config";

export type ItemFormValues = z.input<typeof CreateItemSchema>;
type ItemFormOutput = z.output<typeof CreateItemSchema>;

interface Props {
  shapes: MasterOptionWithCode[];
  grades: MasterOptionWithCode[];
  tolerances: MasterOptionWithCode[];
  conditions: MasterOptionWithCode[];
  sizes: MasterOptionWithCode[];
  /** Per-shape dimension config keyed by shape id (forms/masters redesign). */
  shapeProfiles: Record<string, ShapeConfig>;
  /** When set, the form edits this item in place instead of creating a new one. */
  editItemId?: string;
  /** Prefill values for edit mode - shaped like the form's input fields. */
  initialValues?: Partial<ItemFormValues>;
  /** Compact page header rendered inline with the live-code preview chip. */
  title?: string;
  subtitle?: string;
  backHref?: Route;
  backLabel?: string;
}

/** Dimension unit options (mm / cm / m / inch). */
const UNIT_OPTIONS = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
  { value: "inch", label: "inch" },
];

/** Size-class options - shown alongside the auto-derived value so user can override. */
const SIZE_CODE_OPTIONS = [
  { value: "S", label: "S - Small" },
  { value: "M", label: "M - Medium" },
  { value: "L", label: "L - Large" },
  { value: "SA", label: "SA - Small Assembly" },
  { value: "MA", label: "MA - Medium Assembly" },
  { value: "LA", label: "LA - Large Assembly" },
  { value: "Sp", label: "Sp - Special" },
  { value: "A", label: "A - Assembly" },
  { value: "P", label: "P - Powder" },
];

/**
 * Item form - live code preview plus all classification + dimension +
 * part-description fields.
 */
export function ItemForm({
  shapes,
  grades,
  tolerances,
  conditions,
  // sizes is used for the sizeCodeById lookup map (live preview dep)
  sizes,
  shapeProfiles,
  editItemId,
  initialValues,
  title,
  subtitle,
  backHref,
  backLabel,
}: Props) {
  const isEdit = Boolean(editItemId);
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
    trigger,
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
      hsnCode: "",
      uom: "Nos",
      dimensionUnit: "mm",
      altUom: "",
      // Edit mode prefill - overrides the empty defaults field-by-field.
      ...initialValues,
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

  // Resolve the selected shape's dimension config (which dims apply). Defaults
  // to all-optional when no shape is chosen or it has no config.
  const shapeConfig: ShapeConfig =
    (watchedShapeId && shapeProfiles[watchedShapeId]) || defaultShapeConfig();

  // When the shape changes, blank any dimension the new shape hides so a
  // stale value can't be persisted for an inapplicable field.
  React.useEffect(() => {
    for (const f of DIM_FIELDS) {
      if (shapeConfig.dims[f] === "hidden") {
        setValue(f, undefined, { shouldValidate: false, shouldDirty: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedShapeId]);

  // Folding "Google-Forms" sections - fields per section drive per-step
  // validation on Continue. All item fields are optional client-side (the
  // server enforces shape-required dims), so Continue mostly just advances.
  const SECTION_FIELDS: string[][] = [
    ["shapeId", "internalGradeId", "toleranceId", "conditionId", "sizeCode", "costingType", "gradeCustomer", "gradeNameForCust", "outerDia", "innerDia", "length", "width", "thickness", "dimensionUnit", "dimensionNotes"],
    ["hsnCode", "uom", "altUom", "altUomConversion"],
    ["partNo", "partDescription1", "partDescription2", "partDescription3", "partDescription4", "partTag"],
  ];
  const fold = useFoldingForm(SECTION_FIELDS.length, (f) => trigger(f as never));

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
      seq: 0, // placeholder - real serial drawn on save
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

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      if (isEdit && editItemId) {
        const res = await updateItem(editItemId, values);
        if (!res.ok) {
          setServerError(res.error);
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({ message: "Item updated.", type: "success" });
        router.push(`/items/${editItemId}` as Route);
        return;
      }
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

  // Live code preview chip - rendered inline in the compact header (or on its
  // own when the form is used without a title).
  const previewChip = (
    <div
      className="inline-flex items-center gap-3 rounded-chip border border-hairline px-4 py-2.5"
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
  );

  const hasHeader = Boolean(title || subtitle || backHref);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── Compact header - back link + title + live preview on ≤2 rows ── */}
      {hasHeader ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {backHref && (
            <BackLink href={backHref} label={backLabel ?? "Back"} />
          )}
          {title && (
            <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
              {title}
            </h1>
          )}
          <div className="sm:ml-auto">{previewChip}</div>
          {subtitle && (
            <p className="w-full font-mono text-[13px] text-ink-subtle break-all">
              {subtitle}
            </p>
          )}
        </div>
      ) : (
        <div className="self-start">{previewChip}</div>
      )}

      {/* ── 1 · Classification ───────────────────────────────────── */}
      <FoldingSection
        ctl={fold}
        index={0}
        title="Classification"
        fields={SECTION_FIELDS[0]!}
        hint="These fields drive the internal item code - required for the code to be meaningful."
        summary={displayCode}
      >
        {/* Shape + dimensions + unit on one line - Shape spans two columns so
            it stays wide enough; the visible dims + Unit fill the rest. */}
        <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
          <div className="col-span-2 max-lg:col-span-3 max-sm:col-span-2">
            <Field id="item-shape" label="Shape" labelOnly>
              <Controller
                control={control}
                name="shapeId"
                render={({ field }) => (
                  <Select
                    id="item-shape"
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v || undefined)}
                    placeholder="Select shape"
                    searchable
                    options={shapes.map((s) => ({
                      value: s.id,
                      label: `${s.name}${s.code ? ` (${s.code})` : ""}`,
                    }))}
                  />
                )}
              />
            </Field>
          </div>
          {DIM_FIELDS.map((f) => {
            const rule = shapeConfig.dims[f];
            if (rule === "hidden") return null;
            return (
              <Field
                key={f}
                id={`item-${f}`}
                label={`${DIM_LABELS[f]}${rule === "required" ? " *" : ""}`}
              >
                <input
                  id={`item-${f}`}
                  type="number"
                  min={0}
                  step="any"
                  className="nt-input"
                  placeholder="0.00"
                  {...register(f)}
                />
              </Field>
            );
          })}
          <Field id="item-dim-unit" label="Unit" labelOnly>
            <Controller
              control={control}
              name="dimensionUnit"
              render={({ field }) => (
                <Select
                  id="item-dim-unit"
                  value={field.value ?? "mm"}
                  onValueChange={(v) => field.onChange(v || "mm")}
                  placeholder="Unit"
                  options={UNIT_OPTIONS}
                />
              )}
            />
          </Field>
        </div>
        <Field id="item-dim-notes" label="Dimension Notes">
          <Controller
            control={control}
            name="dimensionNotes"
            render={({ field }) => (
              <NotesField
                id="item-dim-notes"
                value={field.value ?? ""}
                onChange={field.onChange}
                rows={1}
                placeholder="Special notes about dimensions"
                ariaLabel="Dimension notes"
              />
            )}
          />
        </Field>

        {/* Grade · Condition · Tolerance · Size · Costing · customer grades -
            all on one line (wraps to 3 / 2 columns on smaller screens).
            items-end keeps the controls bottom-aligned even if a label wraps. */}
        <div className="grid grid-cols-7 items-end gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
          <Field id="item-grade" label="Internal Grade" labelOnly>
            <Controller
              control={control}
              name="internalGradeId"
              render={({ field }) => (
                <Select
                  id="item-grade"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Grade"
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
                  placeholder="Condition"
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
                  placeholder="XXX"
                  searchable
                  options={tolerances.map((t) => ({
                    value: t.id,
                    label: `${t.name}${t.code ? ` (${t.code})` : ""}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field id="item-size" label="Size" labelOnly>
            <Controller
              control={control}
              name="sizeCode"
              render={({ field }) => (
                <Select
                  id="item-size"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Auto"
                  options={[{ value: "", label: "- Auto -" }, ...SIZE_CODE_OPTIONS]}
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
                  placeholder="Costing"
                  options={COSTING_TYPES.map((ct) => ({
                    value: ct,
                    label: COSTING_TYPE_LABELS[ct],
                  }))}
                />
              )}
            />
          </Field>

          <Field id="item-grade-cust" label="Cust. Grade" labelOnly>
            <Controller
              control={control}
              name="gradeCustomer"
              render={({ field }) => (
                <Select
                  id="item-grade-cust"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v ?? "")}
                  placeholder="Grade"
                  searchable
                  options={grades.map((g) => ({ value: g.name, label: g.name }))}
                />
              )}
            />
          </Field>
          <Field id="item-grade-name-cust" label="Cust. Grade Name" labelOnly>
            <Controller
              control={control}
              name="gradeNameForCust"
              render={({ field }) => (
                <Select
                  id="item-grade-name-cust"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v ?? "")}
                  placeholder="Grade name"
                  searchable
                  options={grades.map((g) => ({ value: g.name, label: g.name }))}
                />
              )}
            />
          </Field>
        </div>
      </FoldingSection>

      {/* ── 2 · Tax & Units ──────────────────────────────────────── */}
      <FoldingSection
        ctl={fold}
        index={1}
        title="Tax & Units"
        fields={SECTION_FIELDS[1]!}
        hint="HSN code (GST) and the unit of measure. Alt UoM lets you record a secondary unit and its conversion to the base UoM."
        summary={watch("hsnCode") ? `HSN ${watch("hsnCode")} · ${watch("uom") ?? "Nos"}` : (watch("uom") ?? "Nos")}
      >
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <Field id="item-hsn" label="HSN Code">
            <input
              id="item-hsn"
              type="text"
              className="nt-input"
              placeholder="e.g. 8209"
              {...register("hsnCode")}
            />
          </Field>
          <Field id="item-uom" label="Unit of Measure (UoM)">
            <input
              id="item-uom"
              type="text"
              className="nt-input"
              placeholder="Nos"
              {...register("uom")}
            />
          </Field>
          <Field id="item-alt-uom" label="Alt UoM">
            <input
              id="item-alt-uom"
              type="text"
              className="nt-input"
              placeholder="e.g. Kg"
              {...register("altUom")}
            />
          </Field>
          <Field id="item-alt-uom-conv" label="Alt UoM Conversion (1 Alt UoM = ? base)">
            <input
              id="item-alt-uom-conv"
              type="number"
              min={0}
              step="any"
              className="nt-input"
              {...register("altUomConversion")}
            />
          </Field>
        </div>
      </FoldingSection>

      {/* ── 3 · Part Details ──────────────────────────────────────── */}
      <FoldingSection
        ctl={fold}
        index={2}
        title="Part Details"
        fields={SECTION_FIELDS[2]!}
        hint="Part number, tag, and up to four description lines for quotation inserts."
        hideContinue
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
        {([1, 2, 3, 4] as const).map((n) => {
          const fieldName = `partDescription${n}` as const;
          return (
            <Field key={n} id={`item-desc${n}`} label={`Part Description ${n}`}>
              <Controller
                control={control}
                name={fieldName}
                render={({ field }) => (
                  <NotesField
                    id={`item-desc${n}`}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    rows={1}
                    ariaLabel={`Part description ${n}`}
                  />
                )}
              />
            </Field>
          );
        })}
      </FoldingSection>

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
          {pending ? "Saving" : isEdit ? "Update Item" : "Create Item"}
        </button>
      </div>
    </form>
  );
}
