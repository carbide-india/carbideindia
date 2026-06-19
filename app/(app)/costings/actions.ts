"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { costings } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  CreateCostingSchema,
  type CreateCostingInput,
} from "@/lib/validators/costing";
import {
  computeInhouseCosting,
  computeBoCosting,
} from "@/lib/costing/compute";

type SaveCostingResult =
  | { ok: true; id: string; finalCostPerPiece: number }
  | { ok: false; error: string };

/**
 * Persist a new costing row — server-recomputes all outputs via the pure
 * engine (never trusts client-sent computed values). Guarantees exactly one
 * chosen costing per inquiry_item by clearing `is_chosen` on siblings first.
 */
export async function saveCosting(
  input: CreateCostingInput,
): Promise<SaveCostingResult> {
  const me = await requireUser();

  const parsed = CreateCostingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const v = parsed.data;

  // ── Apply rate-field defaults (only when the field was omitted) ──
  const lossPct = v.lossPct ?? 0.15;
  const vaFloorPerKg = v.vaFloorPerKg ?? 2000;
  const overheadPct = v.overheadPct ?? 0.25;
  const negotiationPct = v.negotiationPct ?? 0.03;
  const shapingRatePerMin = v.shapingRatePerMin ?? 7;
  const vaPct = v.vaPct ?? 0.3;
  const shapingMins = v.shapingMins ?? 2;
  const machiningRate = v.machiningRate ?? 0;
  const qty = v.qty ?? 0;

  try {
    let finalCostPerPiece: number;
    let quoteValue: number;

    // Columns that only inhouse fills (BO leaves them null)
    let lossWt: string | null = null;
    let rmPerGm: string | null = null;
    let vaPerGm: string | null = null;
    let sinteredCostPerGm: string | null = null;
    let sinteredPricePerPiece: string | null = null;
    let shapingCostPerPiece: string | null = null;
    let machiningCostPerPiece: string | null = null;
    let costAfterMachining: string | null = null;
    let negotiationAmount: string | null = null;

    if (v.costingType === "inhouse") {
      const weightUsed: "pressing" | "theoretical" | "block" =
        v.weightUsed === "pressing" ||
        v.weightUsed === "theoretical" ||
        v.weightUsed === "block"
          ? v.weightUsed
          : "pressing";

      const out = computeInhouseCosting({
        qty,
        toolFlatCost: v.toolFlatCost,
        weightUsed,
        blockWt: v.blockWt,
        theoreticalWt: v.theoreticalWt,
        pressingWt: v.pressingWt,
        lossPct,
        rmPricePerKg: v.rmPricePerKg ?? 0,
        vaPct,
        vaFloorPerKg,
        shapingMins,
        shapingRatePerMin,
        machiningRate,
        overheadPct,
        negotiationPct,
      });

      finalCostPerPiece = out.finalCostPerPiece;
      quoteValue = out.quoteValue;
      lossWt = String(out.lossWtKg);
      rmPerGm = String(out.rmPerGm);
      vaPerGm = String(out.vaPerGm);
      sinteredCostPerGm = String(out.sinteredCostPerGm);
      sinteredPricePerPiece = String(out.sinteredPricePerPiece);
      shapingCostPerPiece = String(out.shapingCostPerPiece);
      machiningCostPerPiece = String(out.machiningCostPerPiece);
      costAfterMachining = String(out.costAfterMachining);
      negotiationAmount = String(out.negotiationAmount);
    } else {
      const out = computeBoCosting({
        qty,
        outsourcedVendorCost: v.outsourcedVendorCost ?? 0,
        vendorOhPct: v.vendorOhPct ?? 0,
        developmentCost: v.developmentCost ?? 0,
      });
      finalCostPerPiece = out.finalCostPerPiece;
      quoteValue = out.quoteValue;
    }

    // ── Exactly-one-chosen guarantee ──
    // If this new costing is chosen (default true per schema), clear any other
    // chosen costings for the same inquiry_item first.
    const isChosen = true; // new costings are always chosen on creation
    if (isChosen) {
      await db
        .update(costings)
        .set({ isChosen: false })
        .where(
          and(
            eq(costings.inquiryItemId, v.inquiryItemId),
            eq(costings.isChosen, true),
          ),
        );
    }

    // ── Insert the new costing row ──
    const [inserted] = await db
      .insert(costings)
      .values({
        inquiryItemId: v.inquiryItemId,
        inquiryId: v.inquiryId,
        costingType: v.costingType,
        costingLogic: v.costingLogic,
        isChosen,
        // inputs
        qty: v.qty != null ? String(v.qty) : null,
        toolType: v.toolType,
        toolCostMethod: v.toolCostMethod,
        toolFlatCost: v.toolFlatCost != null ? String(v.toolFlatCost) : null,
        blockWt: v.blockWt != null ? String(v.blockWt) : null,
        theoreticalWt:
          v.theoreticalWt != null ? String(v.theoreticalWt) : null,
        pressingWt: v.pressingWt != null ? String(v.pressingWt) : null,
        weightUsed: v.weightUsed,
        lossPct: String(lossPct),
        rmPricePerKg:
          v.rmPricePerKg != null ? String(v.rmPricePerKg) : null,
        vaPct: String(vaPct),
        vaFloorPerKg: String(vaFloorPerKg),
        shapingRatePerMin: String(shapingRatePerMin),
        shapingMins: String(shapingMins),
        machiningType: v.machiningType,
        machiningRate: String(machiningRate),
        overheadPct: String(overheadPct),
        negotiationPct: String(negotiationPct),
        outsourcedVendorCost:
          v.outsourcedVendorCost != null
            ? String(v.outsourcedVendorCost)
            : null,
        vendorOhPct:
          v.vendorOhPct != null ? String(v.vendorOhPct) : null,
        vendorNotes: v.vendorNotes,
        developmentCost:
          v.developmentCost != null ? String(v.developmentCost) : null,
        developmentNotes: v.developmentNotes,
        technicalNotes: v.technicalNotes,
        // computed outputs (server-recomputed, never from client)
        lossWt,
        rmPerGm,
        vaPerGm,
        sinteredCostPerGm,
        sinteredPricePerPiece,
        shapingCostPerPiece,
        machiningCostPerPiece,
        costAfterMachining,
        negotiationAmount,
        finalCostPerPiece: String(finalCostPerPiece),
        quoteValue: String(quoteValue),
        // meta
        developmentTime: v.developmentTime,
        deliveryTime: v.deliveryTime,
        validity: v.validity,
        createdById: me.id,
      })
      .returning({ id: costings.id });

    if (!inserted) {
      return { ok: false, error: "Insert failed — please try again." };
    }

    revalidatePath("/costings");
    revalidatePath("/inquiries/" + v.inquiryId);

    return { ok: true, id: inserted.id, finalCostPerPiece };
  } catch (err) {
    console.error("[saveCosting]", err);
    return {
      ok: false,
      error: "Could not save the costing — please try again.",
    };
  }
}
