import { z } from "zod";
import { COSTING_ROUTES, COSTING_LOGICS } from "@/db/enums";

const N = z.coerce.number().optional();
const INT = z.coerce.number().int().optional();

/** number | "" | null | NaN → number | undefined (same guard as OptNum below). */
const VendorOptNum = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = typeof val === "string" ? Number(val) : val;
    return typeof n === "number" && Number.isNaN(n) ? undefined : val;
  },
  z.coerce.number().optional(),
);

/**
 * One competing vendor quote under a BOUGHT_OUT costing (BO multi-vendor matrix).
 * unitPrice is the only required field; everything else is optional (freight is
 * per ORDER, OH is a fraction e.g. 0.1). The array is capped at 5 on the parent.
 * Numeric fields coerce so the client may send strings.
 */
export const VendorQuoteSchema = z.object({
  vendorId: z.string().uuid().optional(),
  vendorNameSnapshot: z.string().optional(),
  unitPrice: z.coerce.number(),
  leadTimeDays: INT,
  creditPeriodDays: INT,
  freightCost: N,
  vendorOhPct: N,
  developmentCost: N,
  // Per-vendor commercial terms (moved off the costing level for BO). Master ids
  // reference the payment_term / quantity_tolerance masters; delivery/validity are
  // a number + a days|weeks unit. `notes` remains SHARED across the matrix.
  paymentTermsId: z.string().uuid().optional(),
  quantityToleranceId: z.string().uuid().optional(),
  deliveryTime: VendorOptNum,
  deliveryTimeUnit: z.enum(["days", "weeks"]).optional(),
  validity: VendorOptNum,
  validityUnit: z.enum(["days", "weeks"]).optional(),
  notes: z.string().optional(),
});
export type VendorQuoteInput = z.input<typeof VendorQuoteSchema>;

export const CreateCostingSchema = z.object({
  inquiryItemId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  costingType: z.enum(COSTING_ROUTES),
  costingLogic: z.enum(COSTING_LOGICS).optional(),
  qty: N,
  toolType: z.string().optional(), toolCostMethod: z.string().optional(), toolFlatCost: N,
  blockWt: N, theoreticalWt: N, pressingWt: N, weightUsed: z.enum(["pressing", "theoretical", "block"]).optional(),
  lossPct: N, rmPricePerKg: N, vaPct: N, vaFloorPerKg: N,
  shapingRatePerMin: N, shapingMins: N,
  machiningType: z.string().optional(), machiningRate: N, overheadPct: N, negotiationPct: N,
  outsourcedVendorCost: N, vendorOhPct: N, vendorNotes: z.string().optional(),
  developmentCost: N, developmentNotes: z.string().optional(), technicalNotes: z.string().optional(),
  developmentTime: z.string().optional(), deliveryTime: z.string().optional(), validity: z.string().optional(),
  // BO multi-vendor matrix: up to 5 competing vendor quotes. The legacy single-
  // vendor fields above (outsourcedVendorCost/vendorOhPct/developmentCost) stay
  // for back-compat; when `vendorQuotes` is present the server ranks these and
  // recommends the cheapest instead.
  vendorQuotes: z.array(VendorQuoteSchema).max(5, "At most 5 vendor quotes.").optional(),
});

export type CreateCostingInput = z.input<typeof CreateCostingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Costing Master engine v3 (spec 2026-07-30) — the calculator SHELL payload.
//
// The shell composes the In-House panel (recomputed server-side via the tested
// `computeInhouseMaster`/mfg-engine) and the Buy-Out panel (ranked via
// `compareVendors`). It saves ONE row for a single path, or TWO rows (in-house +
// bought-out) for the "Both" flow. Numeric UI cells arrive as `number | ""`; the
// schema coerces "" (and null) to undefined so an untouched box is simply absent.
// ─────────────────────────────────────────────────────────────────────────────

/** number | "" | null → number | undefined ("" and null both mean "unset"). */
const OptNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const LevyModeSchema = z.enum(["flat", "per_piece", "none"]);
const ToolTypeSchema = z.enum(["perfect", "block", "big"]);

/** One "Other Development Cost" line from the In-House panel. */
export const DevCostSchema = z.object({
  description: z.string().optional().default(""),
  qty: OptNum,
  rate: OptNum,
  amount: OptNum,
  levyMode: LevyModeSchema.default("none"),
});

/** One machining operation line (Admin-Master op + minutes + rate). */
export const MachiningOpSchema = z.object({
  optionId: z.string().optional().default(""),
  label: z.string().optional().default(""),
  minutes: OptNum,
  rate: OptNum,
});

/** One external machining-vendor rate line. */
export const ExternalMachiningVendorSchema = z.object({
  vendorId: z.string().optional().default(""),
  label: z.string().optional().default(""),
  rate: OptNum,
});

/** The full In-House calculator value (percents are WHOLE numbers, e.g. 30 = 30%). */
export const InhousePayloadSchema = z.object({
  // sizes
  finishedSize: z.string().optional().default(""),
  toleranceSize: z.string().optional().default(""),
  sinteredSize: z.string().optional().default(""),
  greenSize: z.string().optional().default(""),
  shrinkage: z.string().optional().default(""),
  // tooling
  toolingChartId: z.string().optional().default(""),
  toolType: ToolTypeSchema.default("perfect"),
  levyToolMode: LevyModeSchema.default("none"),
  levyToolAmount: OptNum,
  // weight
  weightMethod: z.coerce.number().int().min(1).max(4).default(1),
  blockWt: OptNum,
  theoreticalWt: OptNum,
  pressingWt: OptNum,
  totalWt: OptNum,
  lossPct: OptNum,
  // RM + VA
  rmPerKg: OptNum,
  batchDetails: z.string().optional().default(""),
  vaPct: OptNum,
  vaFloorPerKg: OptNum,
  // shaping
  shapingMins: OptNum,
  shapingRatePerMin: OptNum,
  // mandril
  mandrilRate: OptNum,
  mandrilSize: OptNum,
  // dev costs
  devCosts: z.array(DevCostSchema).max(50).optional().default([]),
  // machining
  machiningOps: z.array(MachiningOpSchema).max(50).optional().default([]),
  internalMachiningRate: OptNum,
  externalVendors: z.array(ExternalMachiningVendorSchema).max(5).optional().default([]),
  machiningChoice: z.string().optional().default("internal"),
  overheadPct: OptNum,
  negotiationPct: OptNum,
});
export type InhousePayload = z.input<typeof InhousePayloadSchema>;
/** Parsed/normalised In-House payload (numbers coerced, "" → undefined). */
export type InhousePayloadOut = z.infer<typeof InhousePayloadSchema>;

/** One Buy-Out vendor row from the Buy-Out panel. `vendorOhPct` is a PERCENT (35 = 35%). */
export const BuyoutRowSchema = z.object({
  vendorId: z.string().uuid().nullish(),
  vendorName: z.string().optional().default(""),
  vendorCode: z.string().nullish(),
  unitPrice: OptNum,
  vendorOhPct: OptNum,
  developmentCost: OptNum,
  leadTimeDays: OptNum,
  creditPeriodDays: OptNum,
  paymentTerms: z.string().nullish(),
  // Per-vendor commercial terms (moved off the costing level for BO). Master-id
  // fields arrive as loose strings ("" when unset) and are normalised with
  // `uuidOrNull` server-side; delivery/validity are a number + a days|weeks unit.
  paymentTermsId: z.string().optional(),
  quantityToleranceId: z.string().optional(),
  deliveryTime: OptNum,
  deliveryTimeUnit: z.enum(["days", "weeks"]).optional(),
  validity: OptNum,
  validityUnit: z.enum(["days", "weeks"]).optional(),
  quoteLink: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  /** Client row key, used only to resolve which row is `selected`. */
  key: z.string().optional(),
});
export type BuyoutRowInput = z.input<typeof BuyoutRowSchema>;

export const BuyoutPayloadSchema = z.object({
  vendors: z.array(BuyoutRowSchema).max(5, "At most 5 vendor quotes."),
  /** `key` of the selected vendor row (whose Final cost feeds the quote); null = cheapest. */
  selectedKey: z.string().nullish(),
});
export type BuyoutPayload = z.input<typeof BuyoutPayloadSchema>;
/** Parsed/normalised Buy-Out payload. */
export type BuyoutPayloadOut = z.infer<typeof BuyoutPayloadSchema>;

/**
 * The Product & Specifications transfer panel's (possibly costing-revised) values.
 * These write back to the LIVE `inquiry_items` spec columns so the PF-vs-Costing
 * variance engine (frozen baseline jsonb vs live columns) reflects costing edits.
 * The panel always sends the FULL current spec; the action overwrites the columns
 * from it (empty → null). Master-id fields are validated as loose strings and
 * normalised with `uuidOrNull` server-side (an empty selection is just cleared).
 */
export const RevisedSpecSchema = z.object({
  custProductName: z.string().optional(),
  custDrawingNo: z.string().optional(),
  drawingRevisionNo: z.string().optional(),
  quantityNos: OptNum,
  quantityUom: z.string().optional(),
  shape: z.string().optional(),
  outerDia: OptNum,
  innerDia: OptNum,
  length: OptNum,
  width: OptNum,
  thickness: OptNum,
  dimensionUnit: z.string().optional(),
  dimensionNotes: z.string().optional(),
  gradeCustomer: z.string().optional(),
  gradeCustomerFacingId: z.string().optional(),
  gradeInternalProductionId: z.string().optional(),
  toleranceId: z.string().optional(),
  conditionId: z.string().optional(),
  internalProductionCodeId: z.string().optional(),
  partNoId: z.string().optional(),
});
export type RevisedSpecInput = z.input<typeof RevisedSpecSchema>;
export type RevisedSpecOut = z.infer<typeof RevisedSpecSchema>;

export const COSTING_MODES = ["bought_out", "inhouse", "both"] as const;

export const SaveCostingMasterSchema = z
  .object({
    inquiryItemId: z.string().uuid(),
    inquiryId: z.string().uuid(),
    costingMode: z.enum(COSTING_MODES),
    /** "Product Sold/Made Before?" entry answer — informational. */
    soldBefore: z.boolean().optional(),
    /** Quantity, pulled from the inquiry line (may be overridden). */
    qty: OptNum,
    // Terminal fields (all Admin-Master driven).
    quantityToleranceId: z.string().uuid().nullish(),
    /** Delivery time as an assembled label, e.g. "30 days" / "4 weeks". */
    deliveryTime: z.string().optional(),
    /** Price validity as an assembled label. */
    validity: z.string().optional(),
    /** Payment terms LABEL (from the payment_term master; defaults from customer). */
    paymentTerms: z.string().optional(),
    technicalNotes: z.string().optional(),
    commercialNotes: z.string().optional(),
    // Path payloads.
    inhouse: InhousePayloadSchema.optional(),
    buyout: BuyoutPayloadSchema.optional(),
    // Revised Product & Specifications (writes back to inquiry_items live columns).
    revisedSpec: RevisedSpecSchema.optional(),
  })
  .refine(
    (v) => (v.costingMode === "bought_out" ? true : Boolean(v.inhouse)),
    { message: "In-house details are required for this costing mode.", path: ["inhouse"] },
  )
  .refine(
    (v) => (v.costingMode === "inhouse" ? true : Boolean(v.buyout)),
    { message: "Bought-out details are required for this costing mode.", path: ["buyout"] },
  );

export type SaveCostingMasterInput = z.input<typeof SaveCostingMasterSchema>;
