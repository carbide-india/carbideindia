import { z } from "zod";
import {
  SAMPLE_LOCATIONS,
  SAMPLE_STATUSES,
  STAGE_STATUSES,
  STAGE_LOCATIONS,
  SAMPLE_REPORT_TYPES,
} from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
/**
 * Optional free-text field: trims, caps length, and folds empty strings to
 * `undefined` so half-filled form inputs never persist as `""`.
 */
const OptionalText = (max = 500) =>
  Trimmed(max).transform((s) => (s === "" ? undefined : s)).optional();

/**
 * Base field set shared by Create/Update — same base-object + derive pattern
 * as lib/validators/inquiry.ts (zod v4 has no `.innerType()` to unwrap).
 * Every enum field defaults to its first option per Manan's dashboard rule:
 * first-option defaults make incomplete stages flaggable at a glance.
 */
const SampleFieldsSchema = z.object({
  sampleDate: z.string().optional(),                  // ISO date; defaults server-side to now
  inquiryId: z.string().uuid().optional(),            // linked enquiry → sampleNo auto-derives
  sampleNo: OptionalText(60),                         // free-text fallback when unlinked
  location: z.enum(SAMPLE_LOCATIONS).default("AYK Cabin"),
  responsiblePersonId: z.string().uuid().optional(),
  photoUrls: z.array(Trimmed(500).min(1)).optional(), // Blob URLs (Task 4 photo upload)
  sampleNotes: OptionalText(2000),
  sampleStatus: z.enum(SAMPLE_STATUSES).default("received"),
  dimensionStatus: z.enum(STAGE_STATUSES).default("not_started"),
  dimensionLocation: z.enum(STAGE_LOCATIONS).default("Undecided"),
  dimensionCompletedOn: z.string().optional(),        // ISO date
  chemicalStatus: z.enum(STAGE_STATUSES).default("not_started"),
  chemicalLocation: z.enum(STAGE_LOCATIONS).default("Undecided"),
  chemicalCompletedOn: z.string().optional(),
  drawingStatus: z.enum(STAGE_STATUSES).default("not_started"),
  drawingLocation: z.enum(STAGE_LOCATIONS).default("Undecided"),
  drawingCompletedOn: z.string().optional(),
  costingStatus: z.enum(STAGE_STATUSES).default("not_started"),
  costingCompletedOn: z.string().optional(),
  reportsUploaded: z.array(z.enum(SAMPLE_REPORT_TYPES)).optional(),
  reportsInSmFolder: z.boolean().default(false),
  processedDate: z.string().optional(),               // ISO date
  processNotes: OptionalText(2000),
});

export const CreateSampleSchema = SampleFieldsSchema;
export type CreateSampleInput = z.input<typeof CreateSampleSchema>;

/**
 * Patch-shaped schema for edits — every field optional, unknown keys
 * rejected, empty patches rejected. Defaulted fields are re-declared without
 * their defaults: otherwise `.partial()` would inject every first-option
 * default into every patch and an empty `{}` would sail past the nonempty
 * refine (same trap as `quantityUom` in UpdateInquirySchema).
 */
export const UpdateSampleSchema = SampleFieldsSchema
  .extend({
    location: z.enum(SAMPLE_LOCATIONS),
    sampleStatus: z.enum(SAMPLE_STATUSES),
    dimensionStatus: z.enum(STAGE_STATUSES),
    dimensionLocation: z.enum(STAGE_LOCATIONS),
    chemicalStatus: z.enum(STAGE_STATUSES),
    chemicalLocation: z.enum(STAGE_LOCATIONS),
    drawingStatus: z.enum(STAGE_STATUSES),
    drawingLocation: z.enum(STAGE_LOCATIONS),
    costingStatus: z.enum(STAGE_STATUSES),
    reportsInSmFolder: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateSampleInput = z.input<typeof UpdateSampleSchema>;

export const SetSampleStatusSchema = z.object({ status: z.enum(SAMPLE_STATUSES) });
