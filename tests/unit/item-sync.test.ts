import { describe, it, expect, vi, beforeEach } from "vitest";

// sync.ts + recordAudit both `import "server-only"`; neutralise so the module
// loads outside a real server component. Audit is fire-and-forget → stub it.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => {}) }));

// The live db is only used by the module's DbOrTx type default; every function
// under test takes an explicit `tx`, so we never touch @/lib/db here. Stub it so
// the import graph resolves without a DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  draftDedupKey,
  missingRequiredDims,
  itemDedupKeyFor,
  specColumns,
  syncProductToItem,
  completeItem,
  type ItemSpec,
} from "@/lib/item-master/sync";
import {
  items,
  masterOptions,
  inquiryItems,
  quotationItems,
  negotiationItems,
  salesOrderItems,
  jobCards,
  documents,
  costings,
} from "@/db/schema";
import { itemDedupKey } from "@/lib/item-master/dedup";

// ── A controllable, table-aware fake transaction ─────────────────────────────
// Behavior is driven by per-table queues so we never interpret opaque drizzle
// predicates. select/update return the next queued rows for the table; insert
// returns the next queued insert-result (null → conflict, empty re-select next).
type Row = Record<string, unknown>;

class FakeTx {
  selectQueues = new Map<unknown, Row[][]>();
  insertQueue: (Row[] | null)[] = [];
  execQueue: Row[][] = [];
  updates: { table: unknown; set: Row }[] = [];
  inserts: { table: unknown; values: Row }[] = [];

  queueSelect(table: unknown, rows: Row[]) {
    const q = this.selectQueues.get(table) ?? [];
    q.push(rows);
    this.selectQueues.set(table, q);
  }
  queueInsert(rows: Row[] | null) { this.insertQueue.push(rows); }
  queueExec(rows: Row[]) { this.execQueue.push(rows); }

  private nextSelect(table: unknown): Row[] {
    const q = this.selectQueues.get(table);
    return (q && q.shift()) ?? [];
  }

  select(_cols?: unknown) {
    const self = this;
    let table: unknown;
    // A terminal that is BOTH awaitable (drizzle `.where()` is thenable, e.g.
    // resolvedShortCodes awaits it directly) AND supports .for()/.limit(). The
    // queued rows are shifted exactly once, lazily, whichever path is used.
    const makeTerminal = () => {
      let resolved: Row[] | undefined;
      const rows = () => (resolved ??= self.nextSelect(table));
      const terminal = {
        for: () => terminal,
        limit: async () => rows(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(rows()).then(resolve, reject),
      };
      return terminal;
    };
    const where = () => makeTerminal();
    return { from: (t: unknown) => { table = t; return { where }; } };
  }

  insert(table: unknown) {
    const self = this;
    return {
      values: (v: Row) => {
        self.inserts.push({ table, values: v });
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            const r = self.insertQueue.shift();
            return r ?? [];
          },
        };
        return chain;
      },
    };
  }

  update(table: unknown) {
    const self = this;
    return {
      set: (v: Row) => {
        self.updates.push({ table, set: v });
        const chain = {
          where: () => chain,
          returning: async () => {
            const r = self.insertQueue.shift(); // reuse insertQueue for update-returning
            return r ?? [];
          },
          then: (resolve: (x: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
        };
        return chain;
      },
    };
  }

  async execute(_sql: unknown) {
    return this.execQueue.shift() ?? [];
  }
}

const SHAPE_ID = "11111111-1111-4111-8111-111111111111";
const GRADE_ID = "22222222-2222-4222-8222-222222222222";
const LINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// A shape whose config requires OD + Length (matches the seeded "Cylinder" preset).
const cylinderConfig = { dims: { outerDia: "required", innerDia: "hidden", length: "required", width: "hidden", thickness: "hidden" } };

/** A complete cylinder spec (OD + Length present). */
function completeSpec(): ItemSpec {
  return { shapeId: SHAPE_ID, internalGradeId: GRADE_ID, outerDia: 100, length: 50 };
}

let tx: FakeTx;
beforeEach(() => {
  tx = new FakeTx();
});

describe("draftDedupKey", () => {
  it("salts by the source line so two incomplete lines never collide", () => {
    expect(draftDedupKey(LINE_A)).toBe(`draft:${LINE_A}`);
    expect(draftDedupKey(LINE_A)).not.toBe(draftDedupKey(LINE_B));
  });
});

describe("missingRequiredDims", () => {
  it("returns ['shape'] when the spec has no shape", async () => {
    const missing = await missingRequiredDims(tx as never, { outerDia: 10 });
    expect(missing).toEqual(["shape"]);
  });

  it("returns ['shape'] when the shape id resolves to no master", async () => {
    tx.queueSelect(masterOptions, []); // shape lookup misses
    const missing = await missingRequiredDims(tx as never, { shapeId: SHAPE_ID, outerDia: 10, length: 5 });
    expect(missing).toEqual(["shape"]);
  });

  it("flags each shape-required dimension that is null", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]);
    const missing = await missingRequiredDims(tx as never, { shapeId: SHAPE_ID, outerDia: 100 }); // length missing
    expect(missing).toEqual(["length"]);
  });

  it("returns [] for a complete spec", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]);
    const missing = await missingRequiredDims(tx as never, completeSpec());
    expect(missing).toEqual([]);
  });
});

describe("itemDedupKeyFor", () => {
  it("complete → real itemDedupKey + active", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]);
    const res = await itemDedupKeyFor(tx as never, completeSpec(), LINE_A);
    expect(res.status).toBe("active");
    expect(res.missing).toEqual([]);
    expect(res.key).toBe(itemDedupKey({ shapeId: SHAPE_ID, internalGradeId: GRADE_ID, outerDia: 100, length: 50 }));
  });

  it("incomplete → provenance-salted draft key + draft", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]);
    const res = await itemDedupKeyFor(tx as never, { shapeId: SHAPE_ID, outerDia: 100 }, LINE_A);
    expect(res.status).toBe("draft");
    expect(res.key).toBe(draftDedupKey(LINE_A));
    expect(res.missing).toEqual(["length"]);
  });
});

describe("specColumns", () => {
  it("writes spec columns only — no customer/qty/sm snapshot", () => {
    const cols = specColumns(completeSpec());
    expect(cols).toMatchObject({ shapeId: SHAPE_ID, internalGradeId: GRADE_ID, outerDia: "100", length: "50" });
    expect(cols).not.toHaveProperty("customerName");
    expect(cols).not.toHaveProperty("qty");
    expect(cols).not.toHaveProperty("smNumber");
  });
});

describe("syncProductToItem — complete spec", () => {
  it("creates an active item then reuses it for an identical second line (dedup)", async () => {
    // First line: shape lookup (dedupKeyFor) → dedup miss → seq draw → insert wins.
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // classify
    tx.queueSelect(items, []); // dedup .for("update") miss
    tx.queueExec([{ seq: 10001 }]);
    tx.queueSelect(masterOptions, [
      { id: SHAPE_ID, name: "Cylinder - Reg", code: "C" },
      { id: GRADE_ID, name: "CIF06", code: "CIF06" },
    ]); // resolvedShortCodes
    tx.queueInsert([{ id: "item-1", itemCode: "M-10001-C-CIF06-XXX-XXX-100.00x50.00" }]);

    const r1 = await syncProductToItem(tx as never, completeSpec(), LINE_A);
    expect(r1.reused).toBe(false);
    expect(r1.status).toBe("active");
    expect(r1.itemId).toBe("item-1");

    // Second identical line: classify → dedup HIT (same fingerprint) → reuse.
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // classify
    tx.queueSelect(items, [{ id: "item-1", itemCode: r1.itemCode, status: "active" }]); // dedup hit
    const r2 = await syncProductToItem(tx as never, completeSpec(), LINE_B);
    expect(r2.reused).toBe(true);
    expect(r2.itemId).toBe("item-1");
  });

  it("re-selects the winner when the insert loses the dedup race", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // classify
    tx.queueSelect(items, []); // dedup miss
    tx.queueExec([{ seq: 10002 }]);
    tx.queueSelect(masterOptions, [{ id: SHAPE_ID, name: "Cylinder - Reg", code: "C" }]); // shortcodes
    tx.queueInsert([]); // onConflictDoNothing → no row (race lost)
    tx.queueSelect(items, [{ id: "item-winner", itemCode: "WIN", status: "active" }]); // re-select

    const r = await syncProductToItem(tx as never, completeSpec(), LINE_A);
    expect(r.reused).toBe(true);
    expect(r.itemId).toBe("item-winner");
  });
});

describe("syncProductToItem — incomplete spec", () => {
  it("creates a DRAFT with a DRAFT-<seq> code and missing:length reason", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // classify → length missing
    tx.queueSelect(items, []); // draft dedup miss
    tx.queueExec([{ seq: 10003 }]);
    tx.queueInsert([{ id: "draft-1", itemCode: "DRAFT-10003" }]);

    const r = await syncProductToItem(tx as never, { shapeId: SHAPE_ID, outerDia: 100 }, LINE_A);
    expect(r.status).toBe("draft");
    expect(r.reused).toBe(false);
    expect(r.missing).toEqual(["length"]);
    const inserted = tx.inserts.find((i) => i.table === items)?.values;
    expect(inserted).toMatchObject({ status: "draft", dedupKey: draftDedupKey(LINE_A), itemCode: "DRAFT-10003", draftReason: "missing:length" });
    expect(inserted?.completedAt).toBeNull();
  });

  it("shape-missing → DRAFT with missing:['shape'] (no shape lookup needed)", async () => {
    tx.queueSelect(items, []); // draft dedup miss (classify short-circuits on no shape)
    tx.queueExec([{ seq: 10004 }]);
    tx.queueInsert([{ id: "draft-2", itemCode: "DRAFT-10004" }]);

    const r = await syncProductToItem(tx as never, { outerDia: 10 }, LINE_B);
    expect(r.status).toBe("draft");
    expect(r.missing).toEqual(["shape"]);
    const inserted = tx.inserts.find((i) => i.table === items)?.values;
    expect(inserted).toMatchObject({ draftReason: "missing:shape", dedupKey: draftDedupKey(LINE_B) });
  });

  it("two different incomplete lines get distinct draft keys (no collapse)", async () => {
    // line A
    tx.queueSelect(items, []);
    tx.queueExec([{ seq: 1 }]);
    tx.queueInsert([{ id: "d-a", itemCode: "DRAFT-1" }]);
    const a = await syncProductToItem(tx as never, { outerDia: 1 }, LINE_A);
    // line B
    tx.queueSelect(items, []);
    tx.queueExec([{ seq: 2 }]);
    tx.queueInsert([{ id: "d-b", itemCode: "DRAFT-2" }]);
    const b = await syncProductToItem(tx as never, { outerDia: 2 }, LINE_B);

    expect(a.itemId).not.toBe(b.itemId);
    const keys = tx.inserts.filter((i) => i.table === items).map((i) => i.values.dedupKey);
    expect(keys).toEqual([draftDedupKey(LINE_A), draftDedupKey(LINE_B)]);
  });
});

describe("completeItem", () => {
  it("stays draft when the filled spec is still incomplete", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // missingRequiredDims → length missing
    const res = await completeItem(tx as never, "draft-1", { shapeId: SHAPE_ID, outerDia: 100 });
    expect(res).toEqual({ ok: false, missing: ["length"] });
    expect(tx.updates.filter((u) => u.table === items)).toHaveLength(0);
  });

  it("promotes in place (same id) when no active twin exists", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // missingRequiredDims → complete
    tx.queueSelect(items, []); // twin lookup: none
    tx.queueExec([{ seq: 20001 }]); // fresh serial
    tx.queueSelect(masterOptions, [{ id: SHAPE_ID, name: "Cylinder - Reg", code: "C" }]); // shortcodes
    tx.queueInsert([{ id: "draft-1", itemCode: "M-20001-C--XXX-XXX-100.00x50.00" }]); // update...returning

    const res = await completeItem(tx as never, "draft-1", completeSpec());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.merged).toBe(false);
      expect(res.itemId).toBe("draft-1"); // same id → zero re-wiring
    }
    const upd = tx.updates.find((u) => u.table === items)?.set;
    expect(upd).toMatchObject({ status: "active", draftReason: null });
    expect(upd?.completedAt).toBeInstanceOf(Date);
  });

  it("merges into an active twin (repoint every table + archive the draft)", async () => {
    tx.queueSelect(masterOptions, [{ config: cylinderConfig }]); // complete
    tx.queueSelect(items, [{ id: "twin-1", itemCode: "TWIN" }]); // twin exists

    const res = await completeItem(tx as never, "draft-1", completeSpec());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.merged).toBe(true);
      expect(res.itemId).toBe("twin-1");
    }

    // repoint fired an update on every item_id-carrying table that exists today.
    const repointed = new Set(tx.updates.map((u) => u.table));
    for (const t of [inquiryItems, quotationItems, negotiationItems, salesOrderItems, jobCards, documents, costings]) {
      expect(repointed.has(t)).toBe(true);
    }
    // the draft itself was archived (not hard-deleted).
    const archive = tx.updates.find((u) => u.table === items && u.set.status === "archived");
    expect(archive?.set).toMatchObject({ status: "archived", isActive: false });
  });
});
