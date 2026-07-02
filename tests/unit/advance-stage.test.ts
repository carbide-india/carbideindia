import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

// ── Feature-flag toggle: the test flips this and re-reads it per case. ─────────
const flagState = { on: true };
vi.mock("@/lib/workflow/flags", () => ({
  isWorkflowFlagOn: vi.fn(async () => flagState.on),
  isFlagOnIn: (f: Record<string, boolean> | null | undefined, k: string) => f?.[k] === true,
}));

// ── Role gate: the test flips the granted role. ───────────────────────────────
const roleState = { grant: true };
vi.mock("@/lib/auth/roles", () => ({
  requireRole: vi.fn(async () => {
    if (!roleState.grant) throw new Error("Forbidden");
    return { id: "emp-1", isActive: true };
  }),
}));

// ── Provisioning: record calls + simulate "already exists" idempotency. ───────
const provisionState = { negotiationExists: false, soExists: false };
const provisionCalls: string[] = [];
vi.mock("@/lib/workflow/provision", () => ({
  provisionNegotiationFromQuote: vi.fn(async () => {
    provisionCalls.push("negotiation");
    return provisionState.negotiationExists
      ? { id: "neg-existing", created: false }
      : { id: "neg-new", created: true };
  }),
  provisionSalesOrderFromNegotiation: vi.fn(async () => {
    provisionCalls.push("sales_order");
    return provisionState.soExists
      ? { id: "so-existing", created: false }
      : { id: "so-new", created: true };
  }),
  smNumberForInquiry: vi.fn(async () => "SM123"),
}));

// ── DB mock — programmable select queue + recorded updates. ───────────────────
// Each tx.select(...).from(...).where(...) resolves the next queued rows.
// `.limit()` and bare-await both return the queued rows; `.returning()` on an
// update returns the queued freeze rows so `frozen` counts are assertable.
const dbState = {
  selectQueue: [] as unknown[][],
  updateReturnQueue: [] as unknown[][],
  updateCalls: [] as Record<string, unknown>[],
  inserted: [] as { table: string; values: unknown }[],
};

function makeSelect() {
  return () => ({
    from: () => ({
      where: () => {
        const rows = dbState.selectQueue.shift() ?? [];
        const thenable = {
          limit: () => Promise.resolve(rows),
          then: (r: (v: unknown) => unknown) => r(rows),
        };
        return thenable;
      },
    }),
  });
}
function makeUpdate() {
  return () => ({
    set: (v: Record<string, unknown>) => {
      dbState.updateCalls.push(v);
      return {
        where: () => {
          const rows = dbState.updateReturnQueue.shift() ?? [];
          return {
            returning: () => Promise.resolve(rows),
            then: (r: (x: unknown) => unknown) => r(undefined),
          };
        },
      };
    },
  });
}
function makeInsert(table: string) {
  return () => ({
    values: (v: unknown) => {
      dbState.inserted.push({ table, values: v });
      return {
        returning: () => Promise.resolve([{ id: "ins-1" }]),
        then: (r: (x: unknown) => unknown) => r(undefined),
      };
    },
  });
}

vi.mock("@/lib/db", () => {
  const tx = {
    select: makeSelect(),
    update: makeUpdate(),
    insert: makeInsert("tx"),
  };
  return {
    db: {
      select: makeSelect(),
      update: makeUpdate(),
      insert: makeInsert("db"),
      transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});

import { advanceStage } from "@/app/(app)/_actions/advance-stage";

beforeEach(() => {
  flagState.on = true;
  roleState.grant = true;
  provisionState.negotiationExists = false;
  provisionState.soExists = false;
  provisionCalls.length = 0;
  dbState.selectQueue = [];
  dbState.updateReturnQueue = [];
  dbState.updateCalls = [];
  dbState.inserted = [];
});

const UUID = "11111111-1111-1111-1111-111111111111";

describe("advanceStage — feature flag (SUPREME SAFETY CONSTRAINT)", () => {
  it("is a hard no-op when the flag is OFF", async () => {
    flagState.on = false;
    const r = await advanceStage({ entity: "quotation", id: UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/off/i);
    // Nothing was inserted/updated — the transaction was never entered.
    expect(dbState.inserted).toHaveLength(0);
    expect(dbState.updateCalls).toHaveLength(0);
    expect(provisionCalls).toHaveLength(0);
  });
});

describe("advanceStage — transition-table validation", () => {
  it("rejects an id that is not a uuid", async () => {
    const r = await advanceStage({ entity: "quotation", id: "not-a-uuid" });
    expect(r.ok).toBe(false);
  });

  it("rejects an undefined target transition", async () => {
    const r = await advanceStage({
      entity: "quotation",
      id: UUID,
      targetStage: "sales_order", // skip — undefined edge
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not allowed/i);
  });
});

describe("advanceStage — role rejection", () => {
  it("propagates a Forbidden throw when the actor lacks the role", async () => {
    roleState.grant = false;
    // quote header select happens after requireRole, so requireRole throws first.
    await expect(advanceStage({ entity: "quotation", id: UUID })).rejects.toThrow(
      /Forbidden/,
    );
  });
});

describe("advanceStage — quotation.sent (guard, freeze, provision)", () => {
  it("rejects when no line has a unit price (guard fail)", async () => {
    // (1) quote header, (2) lines with no price
    dbState.selectQueue = [
      [{ id: UUID, inquiryId: "inq-1", quoteSent: false }],
      [{ id: "ql-1", itemId: "it-1", quotePrice: "0" }],
    ];
    const r = await advanceStage({ entity: "quotation", id: UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unmet?.join(" ")).toMatch(/unit price/i);
    expect(provisionCalls).toHaveLength(0);
  });

  it("freezes priced lines and provisions a draft negotiation", async () => {
    dbState.selectQueue = [
      [{ id: UUID, inquiryId: "inq-1", quoteSent: false }], // header
      [
        { id: "ql-1", itemId: "it-1", quotePrice: "100" },
        { id: "ql-2", itemId: "it-2", quotePrice: "250" },
      ], // lines
    ];
    // Two freeze updates each return one row (frozen), then the quote flip.
    dbState.updateReturnQueue = [[{ id: "ql-1" }], [{ id: "ql-2" }]];
    const r = await advanceStage({ entity: "quotation", id: UUID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stage).toBe("negotiation");
      expect(r.frozenLines).toBe(2);
      expect(r.provisionedId).toBe("neg-new");
      expect(r.provisioned).toBe(true);
    }
    // Freeze wrote unit_price/frozen_at on each line.
    const froze = dbState.updateCalls.filter((c) => "unitPrice" in c);
    expect(froze.length).toBe(2);
    expect(froze[0]).toHaveProperty("frozenAt");
    expect(provisionCalls).toContain("negotiation");
  });

  it("is idempotent: a second call provisions nothing new", async () => {
    provisionState.negotiationExists = true;
    dbState.selectQueue = [
      [{ id: UUID, inquiryId: "inq-1", quoteSent: true }],
      [{ id: "ql-1", itemId: "it-1", quotePrice: "100" }],
    ];
    // Already-frozen line: freeze update returns no rows.
    dbState.updateReturnQueue = [[]];
    const r = await advanceStage({ entity: "quotation", id: UUID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provisioned).toBe(false);
      expect(r.provisionedId).toBe("neg-existing");
      expect(r.frozenLines).toBe(0);
    }
  });
});

describe("advanceStage — negotiation.order_won", () => {
  it("provisions a draft SO when a sent quote + priced won lines exist", async () => {
    dbState.selectQueue = [
      [{ id: UUID, inquiryId: "inq-1", quotationId: "q-1", status: "verbal_yes" }], // header
      [{ id: "nl-1", itemId: "it-1", negotiation: "90", quotePrice: "100" }], // lines
      [{ quoteSent: true }], // isQuoteSent
    ];
    dbState.updateReturnQueue = [[{ id: "nl-1" }]];
    const r = await advanceStage({ entity: "negotiation", id: UUID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stage).toBe("sales_order");
      expect(r.provisionedId).toBe("so-new");
    }
    expect(provisionCalls).toContain("sales_order");
  });

  it("rejects order_won when the parent quote was never sent", async () => {
    dbState.selectQueue = [
      [{ id: UUID, inquiryId: "inq-1", quotationId: "q-1", status: "verbal_yes" }],
      [{ id: "nl-1", itemId: "it-1", negotiation: "90", quotePrice: "100" }],
      [{ quoteSent: false }],
    ];
    const r = await advanceStage({ entity: "negotiation", id: UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unmet?.join(" ")).toMatch(/quotation/i);
    expect(provisionCalls).toHaveLength(0);
  });
});

describe("advanceStage — sales_order.confirmed", () => {
  it("freezes qty_ordered + unit_price when PO + qty present", async () => {
    dbState.selectQueue = [
      [
        {
          id: UUID,
          inquiryId: "inq-1",
          quotationId: "q-1",
          customerPoLink: "http://po",
          customerPoNo: "PO-9",
        },
      ], // header
      [{ id: "sol-1", itemId: "it-1", qty: "50", quotePrice: "100" }], // lines
      [{ quoteSent: true }], // isQuoteSent
    ];
    dbState.updateReturnQueue = [[{ id: "sol-1" }]];
    const r = await advanceStage({ entity: "sales_order", id: UUID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stage).toBe("job_card");
      expect(r.frozenLines).toBe(1);
    }
    const froze = dbState.updateCalls.find((c) => "qtyOrdered" in c);
    expect(froze).toBeDefined();
    expect(froze).toHaveProperty("unitPrice");
  });

  it("rejects confirm with no customer PO", async () => {
    dbState.selectQueue = [
      [
        {
          id: UUID,
          inquiryId: "inq-1",
          quotationId: "q-1",
          customerPoLink: null,
          customerPoNo: null,
        },
      ],
      [{ id: "sol-1", itemId: "it-1", qty: "50", quotePrice: "100" }],
      [{ quoteSent: true }],
    ];
    const r = await advanceStage({ entity: "sales_order", id: UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unmet?.join(" ")).toMatch(/customer PO/i);
  });
});
