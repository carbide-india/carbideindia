import { z } from "zod";
import { COSTING_ROUTES, COSTING_LOGICS } from "@/db/enums";

const N = z.coerce.number().optional();

export const CreateCostingSchema = z.object({
  inquiryItemId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  costingType: z.enum(COSTING_ROUTES),
  costingLogic: z.enum(COSTING_LOGICS).optional(),
  qty: N,
  toolType: z.string().optional(), toolCostMethod: z.string().optional(), toolFlatCost: N,
  blockWt: N, theoreticalWt: N, pressingWt: N, weightUsed: z.string().optional(),
  lossPct: N, rmPricePerKg: N, vaPct: N, vaFloorPerKg: N,
  shapingRatePerMin: N, shapingMins: N,
  machiningType: z.string().optional(), machiningRate: N, overheadPct: N, negotiationPct: N,
  outsourcedVendorCost: N, vendorOhPct: N, vendorNotes: z.string().optional(),
  developmentCost: N, developmentNotes: z.string().optional(), technicalNotes: z.string().optional(),
  developmentTime: z.string().optional(), deliveryTime: z.string().optional(), validity: z.string().optional(),
});

export type CreateCostingInput = z.input<typeof CreateCostingSchema>;
