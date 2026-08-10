import { z } from "zod";
import { SALES_ORDER_STATUSES } from "@/db/enums";

/**
 * Zod schemas for the Sales Order stage-bucket + dual-output write paths.
 *
 * Kept OUT of `lib/validators/sales-order.ts` deliberately: that file models the
 * create/update form contract and is shared with the bulk importer, while these
 * schemas belong to the two-copy workflow added in 2026-08. Same house rules -
 * server-side validation on every action, hostile client assumed.
 */

/** Free-text note cap. Generous: production notes are prose, not a code. */
const NOTE_MAX = 4000;

const NoteText = z
  .string()
  .max(NOTE_MAX, `Notes can be at most ${NOTE_MAX} characters.`)
  .transform((s) => {
    const t = s.trim();
    return t === "" ? null : t;
  });

/** The house stage bucket of the Sales Order stage. */
export const SetSalesOrderStatusSchema = z.object({
  status: z.enum(SALES_ORDER_STATUSES),
});
export type SetSalesOrderStatusInput = z.input<typeof SetSalesOrderStatusSchema>;

/** Which of the two outputs a send-toggle targets. */
export const SalesOrderCopySchema = z.enum(["customer", "factory"]);

export const SetCopySentSchema = z.object({
  copy: SalesOrderCopySchema,
  sent: z.boolean(),
});
export type SetCopySentInput = z.input<typeof SetCopySentSchema>;

/** Header-level factory narrative (prints on the factory copy only). */
export const UpdateProductionNotesSchema = z.object({
  productionNotes: NoteText.nullable(),
});
export type UpdateProductionNotesInput = z.input<
  typeof UpdateProductionNotesSchema
>;

/** Per-line factory note (prints on the factory copy only). */
export const UpdateLineProductionNotesSchema = z.object({
  lineId: z.string().uuid("Invalid line id."),
  productionNotes: NoteText.nullable(),
});
export type UpdateLineProductionNotesInput = z.input<
  typeof UpdateLineProductionNotesSchema
>;
