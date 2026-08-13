import { z } from "zod";

/**
 * A form captured as printable content.
 *
 * The "View in PDF" button reads the RENDERED form rather than mapping each
 * form's fields by hand: every field in the forms module now renders through
 * the same `Field` shell (a `.nt-field-label` plus its control) inside a
 * `SectionCard`, so one reader serves all ten forms and any form added later.
 *
 * This module is pure (no DOM, no pdfkit) so the client that builds a snapshot
 * and the route that renders it validate against exactly the same shape.
 */

export const FormSnapshotRowSchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().max(4000),
});

export const FormSnapshotSectionSchema = z.object({
  title: z.string().trim().max(200),
  rows: z.array(FormSnapshotRowSchema).max(400),
});

export const FormSnapshotSchema = z.object({
  /** Document heading, e.g. "New Enquiry". */
  title: z.string().trim().min(1).max(160),
  /** Optional line under the heading (SM number, client, …). */
  subtitle: z.string().trim().max(240).optional(),
  /**
   * true → the form has not been saved, so the page is stamped DRAFT. The
   * button sets this from whether the record exists yet; it is never a
   * cosmetic choice, because an unsaved preview must not be mistaken for the
   * filed document.
   */
  draft: z.boolean().default(true),
  sections: z.array(FormSnapshotSectionSchema).min(1).max(60),
});

export type FormSnapshotRow = z.infer<typeof FormSnapshotRowSchema>;
export type FormSnapshotSection = z.infer<typeof FormSnapshotSectionSchema>;
export type FormSnapshot = z.infer<typeof FormSnapshotSchema>;

/** Blank values print as an em dash so a gap reads as "not filled", not as a bug. */
export const EMPTY_VALUE = "—";

/** Filename stem for the download, e.g. "new-enquiry-draft". */
export function formSnapshotFileStem(snap: Pick<FormSnapshot, "title" | "draft">): string {
  const slug = snap.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "form"}${snap.draft ? "-draft" : ""}`;
}
