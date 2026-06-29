import { z } from "zod";

/**
 * Shape-driven dimension configuration (forms/masters redesign — Phase B).
 *
 * A Shape master carries a `config` that says, for each of the five item
 * dimensions, whether it is required / optional / hidden. Forms read this to
 * show only the applicable inputs (a solid Cylinder needs OD + Length; a Flat
 * needs L + W + Thickness; etc.), and the server enforces the required ones.
 *
 * This module is pure (no db / no server-only) so it is shared by client forms,
 * server actions, validators, and unit tests alike.
 */

/** The five physical dimension columns on items / inquiry_items. */
export const DIM_FIELDS = [
  "outerDia",
  "innerDia",
  "length",
  "width",
  "thickness",
] as const;
export type DimField = (typeof DIM_FIELDS)[number];

export const DIM_LABELS: Record<DimField, string> = {
  outerDia: "Outer Dia",
  innerDia: "Inner Dia",
  length: "Length",
  width: "Width",
  thickness: "Thickness",
};

export type DimRule = "required" | "optional" | "hidden";

export interface ShapeConfig {
  dims: Record<DimField, DimRule>;
}

/** Every-dimension-optional — the safe default (today's behavior). */
export function defaultShapeConfig(): ShapeConfig {
  return {
    dims: {
      outerDia: "optional",
      innerDia: "optional",
      length: "optional",
      width: "optional",
      thickness: "optional",
    },
  };
}

const DimRuleSchema = z.enum(["required", "optional", "hidden"]);

/** Validates a stored/submitted shape config; fills any missing dim as optional. */
export const ShapeConfigSchema = z.object({
  dims: z
    .object({
      outerDia: DimRuleSchema,
      innerDia: DimRuleSchema,
      length: DimRuleSchema,
      width: DimRuleSchema,
      thickness: DimRuleSchema,
    })
    .partial()
    .transform((d) => ({ ...defaultShapeConfig().dims, ...d })),
});

/**
 * Coerce an unknown stored `config` value into a usable ShapeConfig, falling
 * back to all-optional when null / malformed (never throws — masters predate
 * the column and other kinds may store unrelated config later).
 */
export function resolveShapeConfig(raw: unknown): ShapeConfig {
  const parsed = ShapeConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultShapeConfig();
}

/** Rule for one dimension under a config. */
export function dimRule(config: ShapeConfig, field: DimField): DimRule {
  return config.dims[field];
}

/** Dimensions visible on the form (everything except hidden). */
export function visibleDims(config: ShapeConfig): DimField[] {
  return DIM_FIELDS.filter((f) => config.dims[f] !== "hidden");
}

/** Dimensions the shape requires (used by client marking + server enforcement). */
export function requiredDims(config: ShapeConfig): DimField[] {
  return DIM_FIELDS.filter((f) => config.dims[f] === "required");
}

/**
 * The canonical family presets for Carbide's seeded shapes, matched by name.
 * Returns null for names with no known geometry (e.g. "Special", "Assembly")
 * so they keep the all-optional default. Variant suffix ("- Reg"/"- Spl") is
 * ignored — the geometry family drives the dimensions.
 */
export function presetForShapeName(name: string): ShapeConfig | null {
  const n = name.trim().toLowerCase();
  // Hollow cylinder / ring / bush: OD + ID + Length.
  if (n.startsWith("h. cylinder") || n.startsWith("h.cylinder") || n.startsWith("hollow") || n.startsWith("ring") || n.startsWith("bush")) {
    return {
      dims: { outerDia: "required", innerDia: "required", length: "required", width: "hidden", thickness: "hidden" },
    };
  }
  // Solid cylinder / rod: OD + Length.
  if (n.startsWith("cylinder") || n.startsWith("rod")) {
    return {
      dims: { outerDia: "required", innerDia: "hidden", length: "required", width: "hidden", thickness: "hidden" },
    };
  }
  // Flat / plate / block: Length + Width + Thickness.
  if (n.startsWith("flat") || n.startsWith("plate") || n.startsWith("block") || n.startsWith("strip")) {
    return {
      dims: { outerDia: "hidden", innerDia: "hidden", length: "required", width: "required", thickness: "required" },
    };
  }
  return null;
}
