import { z } from "zod";
import { MEETING_PURPOSES } from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
/**
 * Optional free-text field: trims, caps length, and folds empty strings to
 * `undefined` so half-filled form inputs never persist as `""`.
 */
const OptionalText = (max = 500) =>
  Trimmed(max).transform((s) => (s === "" ? undefined : s)).optional();

/**
 * "HH:MM" wall-clock time, stored as text. Accepts "" (folded to undefined,
 * same as the KYC meetingStart field) or a 24-hour HH:MM string.
 */
const MeetingTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => !v || /^\d{2}:\d{2}$/.test(v), { message: "Use HH:MM" });

/**
 * Base field set shared by Create/Update — same base-object + derive pattern
 * as lib/validators/sample.ts (zod v4 has no `.innerType()` to unwrap). The
 * selfie-required refinement lives on Create only (a proof-of-visit gate);
 * Update derives from this default-less base so edits don't re-demand it.
 */
const ClientMeetingFieldsSchema = z.object({
  salesPersonId: z.string().uuid().optional(),       // action defaults to current user
  clientId: z.string().uuid().optional(),
  companyName: Trimmed(160).min(1, "Company name is required"),
  contactPersonName: Trimmed(120).min(1, "Contact person is required"),
  contactPersonDesignation: OptionalText(120),
  meetingDate: z.string().optional(),                // ISO date; defaults server-side to now
  meetingTime: MeetingTime,
  clientType: OptionalText(80),
  purpose: z.enum(MEETING_PURPOSES),
  purposeOther: OptionalText(200),
  meetingNotes: OptionalText(2000),
  nextFollowUpDate: z.string().optional(),           // ISO date
  selfieUrl: OptionalText(2000),
});

/**
 * Create — purpose defaults to its first option, and a client-location selfie
 * is mandatory (the whole point of this form is proof-of-visit). "Other"
 * purpose must carry a typed specify value.
 */
export const CreateClientMeetingSchema = ClientMeetingFieldsSchema.extend({
  purpose: z.enum(MEETING_PURPOSES).default("regular_order"),
}).superRefine((v, ctx) => {
  if (v.purpose === "other" && !v.purposeOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["purposeOther"],
      message: "Specify the purpose.",
    });
  }
  if (!v.selfieUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selfieUrl"],
      message: "A client-location selfie is required.",
    });
  }
});
export type CreateClientMeetingInput = z.input<typeof CreateClientMeetingSchema>;

/**
 * Patch-shaped schema for edits — every field optional, unknown keys rejected,
 * empty patches rejected. Derived from the default-less base object so the
 * selfie-required gate (Create-only) never blocks an edit, and `.partial()`
 * doesn't inject the purpose default into every patch.
 */
export const UpdateClientMeetingSchema = ClientMeetingFieldsSchema.partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateClientMeetingInput = z.input<typeof UpdateClientMeetingSchema>;

export const SetMeetingPurposeSchema = z.object({
  purpose: z.enum(MEETING_PURPOSES),
});
