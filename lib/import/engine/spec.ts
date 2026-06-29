// lib/import/engine/spec.ts
// Pure types shared by the client grid and the server commit. No runtime deps.

export type RefKind =
  | "grade" | "tolerance" | "condition" | "shape"
  | "customerType" | "industryType" | "productType"
  | "client" | "employee" | "inquirySM";

export type FieldType =
  | "text" | "number" | "date" | "boolean" | "enum" | "ref" | "refMulti";

export interface EnumOption { label: string; value: string }

export interface ImportField {
  /** db/form field name the value maps to. */
  key: string;
  /** Column header in the template + uploaded sheet. */
  header: string;
  required?: boolean;
  type: FieldType;
  /** For type "enum": allowed label/value pairs (matched on label, case-insensitive). */
  enumValues?: EnumOption[];
  /** For type "ref"/"refMulti": which lookup table, and whether new masters may be created inline. */
  ref?: { kind: RefKind; allowCreate?: boolean };
  example?: string;
  maxLen?: number;
  /** For type "number": minimum allowed value (inclusive). Lets the grid flag
   *  values the downstream validator would reject (e.g. quantity must be ≥ 1). */
  min?: number;
}

export interface ImportSpec {
  formKey: string;
  title: string;
  /** Module base path, e.g. "/inquiries" — button + import page live under it. */
  basePath: string;
  fields: ImportField[];
}

/** A reference option the grid can match against / pick from. */
export interface RefOption { id: string; label: string }
/** Server-provided option lists per referenced kind. */
export type Lookups = Partial<Record<RefKind, RefOption[]>>;

/** Marker the client sends when an admin chose "+ create new master". */
export interface CreateMasterMarker { __createMaster: { kind: RefKind; name: string } }

/** Final per-cell value the client commits. Ref cells send an id, a create
 *  marker, an array of those (refMulti), or null. */
export type ImportCellPayload =
  | string | number | boolean | null | string[]
  | CreateMasterMarker | Array<string | CreateMasterMarker>;

export type ImportRowPayload = Record<string, ImportCellPayload>;

export function isCreateMarker(v: unknown): v is CreateMasterMarker {
  return typeof v === "object" && v !== null && "__createMaster" in v;
}
