import { describe, expect, it } from "vitest";
import {
  PIPELINE_MODULES,
  allowedModules,
  moduleForPath,
  nextModuleFor,
  prevModuleFor,
} from "@/lib/modules/pipeline";

/** Everything a fully-permitted person holds. */
const ALL = new Set(PIPELINE_MODULES.flatMap((m) => [m.viewPermission, m.managePermission]));

describe("moduleForPath", () => {
  it("matches a module and its sub-routes", () => {
    expect(moduleForPath("/costings")?.key).toBe("costing");
    expect(moduleForPath("/costings/abc-123")?.key).toBe("costing");
    expect(moduleForPath("/quotations/new")?.key).toBe("quotation");
  });

  it("does not mistake secondary feasibility for primary", () => {
    // Longest-prefix wins: /secondary-feasibility must never resolve to
    // /feasibility, or the next-module step would skip a whole stage.
    expect(moduleForPath("/secondary-feasibility")?.key).toBe("secondary-feasibility");
    expect(moduleForPath("/secondary-feasibility/confirmed")?.key).toBe(
      "secondary-feasibility",
    );
    expect(moduleForPath("/feasibility")?.key).toBe("primary-feasibility");
  });

  it("treats both enquiry segments as the enquiry module", () => {
    expect(moduleForPath("/enquiries/new")?.key).toBe("enquiry");
    expect(moduleForPath("/inquiries")?.key).toBe("enquiry");
  });

  it("returns null off the pipeline", () => {
    expect(moduleForPath("/admin/roles")).toBeNull();
    expect(moduleForPath("/hub")).toBeNull();
  });
});

describe("nextModuleFor", () => {
  it("walks the pipeline in order", () => {
    expect(nextModuleFor("/clients", ALL)?.key).toBe("sample");
    expect(nextModuleFor("/samples", ALL)?.key).toBe("enquiry");
    expect(nextModuleFor("/feasibility", ALL)?.key).toBe("secondary-feasibility");
    expect(nextModuleFor("/costings", ALL)?.key).toBe("quotation");
  });

  it("ends at the last module rather than wrapping round", () => {
    expect(nextModuleFor("/sales-orders", ALL)).toBeNull();
  });

  it("starts at the first module when the path is off-pipeline", () => {
    expect(nextModuleFor("/hub", ALL)?.key).toBe("kyc");
  });

  it("skips modules the viewer may not enter", () => {
    // Can see costing but not quotation → from costing the next stop is
    // negotiation, not a dead end on a page they'd be refused.
    const partial = new Set(["costing.view", "negotiations.view", "sales_orders.view"]);
    expect(nextModuleFor("/costings", partial)?.key).toBe("negotiation");
  });

  it("returns null when nothing further is permitted", () => {
    const onlyCosting = new Set(["costing.view"]);
    expect(nextModuleFor("/costings", onlyCosting)).toBeNull();
  });

  it("null permissions means enforcement is off — everything is reachable", () => {
    expect(nextModuleFor("/costings", null)?.key).toBe("quotation");
    expect(nextModuleFor("/clients", null)?.key).toBe("sample");
  });

  it("an EMPTY set is not the same as null — it grants nothing", () => {
    // The distinction that stops a flag flip from hiding the pipeline from
    // everyone: null = unrestricted, empty = holds no permissions.
    expect(nextModuleFor("/clients", new Set())).toBeNull();
  });
});

describe("prevModuleFor", () => {
  it("walks the pipeline backwards", () => {
    expect(prevModuleFor("/samples", ALL)?.key).toBe("kyc");
    expect(prevModuleFor("/secondary-feasibility", ALL)?.key).toBe("primary-feasibility");
    expect(prevModuleFor("/quotations", ALL)?.key).toBe("costing");
    expect(prevModuleFor("/sales-orders", ALL)?.key).toBe("negotiation");
  });

  it("stops at the head of the pipeline", () => {
    expect(prevModuleFor("/clients", ALL)).toBeNull();
  });

  it("returns null off-pipeline rather than jumping to the last module", () => {
    // "Forward" from nowhere sensibly starts at the first stage; "back" from
    // nowhere has no meaning, so the button simply does not render.
    expect(prevModuleFor("/hub", ALL)).toBeNull();
    expect(prevModuleFor("/admin/roles", ALL)).toBeNull();
  });

  it("skips modules the viewer may not enter", () => {
    const partial = new Set(["clients.view", "feasibility.view", "costing.view"]);
    // From costing, secondary feasibility is permitted, so that is the step back.
    expect(prevModuleFor("/costings", partial)?.key).toBe("secondary-feasibility");
    // From secondary, primary is permitted too (same permission key).
    expect(prevModuleFor("/secondary-feasibility", partial)?.key).toBe(
      "primary-feasibility",
    );
    // From primary, enquiry and sample are not — it falls back to KYC.
    expect(prevModuleFor("/feasibility", partial)?.key).toBe("kyc");
  });

  it("null permissions means enforcement is off", () => {
    expect(prevModuleFor("/costings", null)?.key).toBe("secondary-feasibility");
  });

  it("an EMPTY set grants nothing", () => {
    expect(prevModuleFor("/sales-orders", new Set())).toBeNull();
  });

  it("next and prev are inverses across the whole chain", () => {
    for (let i = 1; i < PIPELINE_MODULES.length; i++) {
      const here = PIPELINE_MODULES[i]!;
      const back = prevModuleFor(here.href, ALL);
      expect(back?.key, here.key).toBe(PIPELINE_MODULES[i - 1]!.key);
      expect(nextModuleFor(back!.href, ALL)?.key, here.key).toBe(here.key);
    }
  });
});

describe("allowedModules", () => {
  it("returns the whole pipeline when enforcement is off", () => {
    expect(allowedModules(null)).toHaveLength(PIPELINE_MODULES.length);
  });

  it("filters to what the viewer holds, in pipeline order", () => {
    const keys = allowedModules(new Set(["quotations.view", "clients.view"])).map((m) => m.key);
    expect(keys).toEqual(["kyc", "quotation"]);
  });
});

describe("catalogue integrity", () => {
  it("has unique keys and hrefs", () => {
    expect(new Set(PIPELINE_MODULES.map((m) => m.key)).size).toBe(PIPELINE_MODULES.length);
    expect(new Set(PIPELINE_MODULES.map((m) => m.href)).size).toBe(PIPELINE_MODULES.length);
  });

  it("names a view and a manage permission for every module", () => {
    for (const m of PIPELINE_MODULES) {
      expect(m.viewPermission, m.key).toMatch(/\.view$/);
      expect(m.managePermission, m.key).toMatch(/\.manage$/);
    }
  });
});
