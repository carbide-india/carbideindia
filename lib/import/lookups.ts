// lib/import/lookups.ts
import "server-only";
import { db } from "@/lib/db";
import { inquiries } from "@/db/schema";
import type { MasterKind } from "@/db/enums";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listClientOptions } from "@/lib/queries/clients";
import type { Lookups, RefKind, RefOption } from "@/lib/import/engine/spec";

const MASTER_KIND: Partial<Record<RefKind, MasterKind>> = {
  grade: "internal_grade", tolerance: "tolerance", condition: "condition", shape: "shape",
  customerType: "customer_type", industryType: "industry_type", productType: "product_type",
};

/** Load the option lists the resolver/grid needs, for just the kinds a spec uses. */
export async function loadLookups(kinds: RefKind[]): Promise<Lookups> {
  const out: Lookups = {};
  for (const kind of kinds) {
    const masterKind = MASTER_KIND[kind];
    if (masterKind) {
      const opts = await listMasterOptions(masterKind);
      out[kind] = opts.map((o): RefOption => ({ id: o.id, label: o.name }));
    } else if (kind === "employee") {
      out[kind] = (await listEmployeeOptions()).map((e): RefOption => ({ id: e.id, label: e.name }));
    } else if (kind === "client") {
      out[kind] = (await listClientOptions()).map((c): RefOption => ({ id: c.id, label: c.name }));
    } else if (kind === "inquirySM") {
      const rows = await db.select({ id: inquiries.id, sm: inquiries.smNumber }).from(inquiries);
      out[kind] = rows.map((r): RefOption => ({ id: r.id, label: r.sm }));
    }
  }
  return out;
}

export function specRefKinds(fields: { ref?: { kind: RefKind } }[]): RefKind[] {
  return [...new Set(fields.filter((f) => f.ref).map((f) => f.ref!.kind))];
}
