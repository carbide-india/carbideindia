import { z } from "zod";

/**
 * Job Card (production work-order) validator. `jobCardNo` is the only required
 * field (user-entered, unique case-insensitively); everything else is an
 * optional snapshot/link that the form may leave blank.
 *
 * Numeric fields use `z.coerce.number()` so FormData string inputs are
 * accepted; date fields stay as strings and are parsed in the action. Optional
 * text is trimmed; uuid links are validated as uuids.
 */

const Trimmed = (max: number) => z.string().trim().max(max);
/** Optional free-text: trims, caps length, folds empty string → undefined. */
const OptionalText = (max = 500) =>
  Trimmed(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();

const OptionalUuid = z.string().uuid().optional();
const OptionalNumber = z.coerce.number().optional();
const OptionalDate = z.string().optional(); // ISO/date string - parsed in the action

export const CreateJobCardSchema = z.object({
  // Required work-order number.
  jobCardNo: z.string().trim().min(1, "Job card number is required.").max(60),

  // Header / dates.
  jobCardDate: OptionalDate,
  oaNo: OptionalText(120),
  deliveryDate: OptionalDate,

  // Links + snapshots.
  salesOrderId: OptionalUuid,
  clientId: OptionalUuid,
  customerName: OptionalText(300),
  itemId: OptionalUuid,
  productCode: OptionalText(120),
  productName: OptionalText(300),

  // Sizing.
  diaSize: OptionalText(120),
  punchSize: OptionalText(120),
  proposedSize: OptionalText(120),

  // Grade.
  gradeName: OptionalText(120),
  gradeColour: OptionalText(120),

  // Quantities / weights.
  weight: OptionalNumber,
  heightMin: OptionalNumber,
  heightMax: OptionalNumber,
  orderQuantity: OptionalNumber,
  plannedQtyToPress: OptionalNumber,

  // Master FKs.
  dispatchConditionId: OptionalUuid,
  toleranceId: OptionalUuid,
  pressingTypeId: OptionalUuid,

  // Tooling.
  ypNo: OptionalText(120),
  supportSizeTop: OptionalText(120),
  supportSizeBottom: OptionalText(120),

  // Process flags.
  makeSampleForSintering: z.boolean().optional(),
  outsource: z.boolean().optional(),
  supplierVendorName: OptionalText(300),
  process: OptionalText(2000),

  // Previous-run reference.
  prevWeight: OptionalNumber,
  prevPressure: OptionalText(120),
  prevGradeName: OptionalText(120),

  remarks: OptionalText(2000),
});

export type CreateJobCardInput = z.input<typeof CreateJobCardSchema>;

/**
 * Patch-shaped schema for edits - every field optional, unknown keys rejected,
 * empty patches rejected. `jobCardNo` stays optional (blank patch leaves it).
 */
export const UpdateJobCardSchema = CreateJobCardSchema.extend({
  jobCardNo: z.string().trim().min(1, "Job card number is required.").max(60).optional(),
})
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export type UpdateJobCardInput = z.input<typeof UpdateJobCardSchema>;
