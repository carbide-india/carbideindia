import type { InhouseCalculatorValue } from "@/lib/costing/inhouse-master";
import type { BuyoutValue } from "@/components/costings/buyout-calculator";
import { COSTING_MODES } from "@/lib/validators/costing";

type CostingMode = (typeof COSTING_MODES)[number];

/**
 * The Costing Master calculator's initial state when re-opening an existing
 * costing to edit / revise. Built server-side from the costing's saved snapshot
 * (lib/costing/from-snapshot.ts) and handed to the shell as a prop. Pure types
 * only — safe to import from both server and client.
 */
export interface CostingCalculatorInitial {
  mode: CostingMode;
  soldBefore?: boolean;
  qty: number | "";
  inhouse: InhouseCalculatorValue;
  buyout: BuyoutValue;
  quantityToleranceId: string;
  /** Free-text duration labels as stored ("30 days"); the shell parses them. */
  deliveryTime: string | null;
  validity: string | null;
  /** Payment-terms LABEL; the shell reverse-maps it to the master id. */
  paymentTerms: string | null;
  technicalNotes: string;
  commercialNotes: string;
}
