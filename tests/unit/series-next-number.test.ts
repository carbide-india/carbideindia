import { describe, it, expect } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  financialYearLabel,
  formatDocNumber,
  nextDocNumber,
  SERIES_DEFAULTS,
} from "@/lib/series/next-number";

const dialect = new PgDialect();

describe("financialYearLabel — Indian FY (Apr–Mar)", () => {
  it("Apr–Dec belong to the FY starting that April", () => {
    expect(financialYearLabel(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
    expect(financialYearLabel(new Date("2026-07-02T00:00:00Z"))).toBe("2026-27");
    expect(financialYearLabel(new Date("2026-12-31T00:00:00Z"))).toBe("2026-27");
  });
  it("Jan–Mar belong to the FY that started the PREVIOUS April", () => {
    expect(financialYearLabel(new Date("2027-01-15T00:00:00Z"))).toBe("2026-27");
    expect(financialYearLabel(new Date("2027-03-31T00:00:00Z"))).toBe("2026-27");
  });
  it("rolls over on Apr 1", () => {
    expect(financialYearLabel(new Date("2027-04-01T00:00:00Z"))).toBe("2027-28");
  });
  it("pads the end year to two digits across a century-ish boundary", () => {
    expect(financialYearLabel(new Date("2009-05-01T00:00:00Z"))).toBe("2009-10");
    expect(financialYearLabel(new Date("2000-05-01T00:00:00Z"))).toBe("2000-01");
  });
});

describe("formatDocNumber", () => {
  it("prefix/FY/padded value", () => {
    expect(formatDocNumber("INV", "2026-27", 4, 42)).toBe("INV/2026-27/0042");
    expect(formatDocNumber("DN", "2026-27", 4, 1)).toBe("DN/2026-27/0001");
  });
  it("no prefix → FY/padded", () => {
    expect(formatDocNumber("", "2026-27", 5, 7)).toBe("2026-27/00007");
  });
  it("value wider than pad is not truncated", () => {
    expect(formatDocNumber("INV", "2026-27", 4, 123456)).toBe("INV/2026-27/123456");
  });
  it("series defaults exist for every register", () => {
    expect(SERIES_DEFAULTS.invoice.prefix).toBe("INV");
    expect(SERIES_DEFAULTS.dn.prefix).toBe("DN");
    expect(SERIES_DEFAULTS.credit_note.prefix).toBe("CN");
  });
});

// ── nextDocNumber against a fake transaction ────────────────────────────────
// The real allocator serializes via SELECT … FOR UPDATE; here we model the
// counter table in-memory and assert the GAPLESS, monotonic contract: sequential
// calls never skip or repeat, and each FY has its own counter.
type Row = { series_key: string; fy_label: string; prefix: string; pad_to: number; last_value: number };

function makeFakeTx(store: Map<string, Row>) {
  // Minimal fake mirroring the four SQL shapes next-number issues. We compile
  // the drizzle SQL object with a real PgDialect to get the text + bound params,
  // then dispatch on the statement shape — so the test exercises the REAL query
  // strings the allocator emits (not a hand-copied mirror).
  return {
    async execute(query: SQL) {
      const compiled = dialect.sqlToQuery(query);
      const text = compiled.sql;
      const params = compiled.params as unknown[];
      if (/INSERT INTO "doc_number_series"/i.test(text)) {
        const [seriesKey, fyLabel, prefix, padTo] = params as [string, string, string, number];
        const key = `${seriesKey}|${fyLabel}`;
        if (!store.has(key)) {
          store.set(key, { series_key: seriesKey, fy_label: fyLabel, prefix, pad_to: Number(padTo), last_value: 0 });
        }
        return [] as unknown;
      }
      if (/SELECT[\s\S]*FOR UPDATE/i.test(text)) {
        const [seriesKey, fyLabel] = params as [string, string];
        const row = store.get(`${seriesKey}|${fyLabel}`);
        return (row ? [row] : []) as unknown;
      }
      if (/UPDATE "doc_number_series"/i.test(text)) {
        const [value, seriesKey, fyLabel] = params as [number, string, string];
        const row = store.get(`${seriesKey}|${fyLabel}`);
        if (row) row.last_value = Number(value);
        return [] as unknown;
      }
      return [] as unknown;
    },
  };
}

describe("nextDocNumber — gapless + FY-scoped", () => {
  it("allocates 0001, 0002, 0003 in order for one series+FY", async () => {
    const store = new Map<string, Row>();
    const tx = makeFakeTx(store) as any;
    const d = new Date("2026-07-02T00:00:00Z");
    const a = await nextDocNumber(tx, "invoice", d);
    const b = await nextDocNumber(tx, "invoice", d);
    const c = await nextDocNumber(tx, "invoice", d);
    expect([a.value, b.value, c.value]).toEqual([1, 2, 3]);
    expect(a.formatted).toBe("INV/2026-27/0001");
    expect(c.formatted).toBe("INV/2026-27/0003");
  });

  it("separate counters per FY (rollover restarts at 1)", async () => {
    const store = new Map<string, Row>();
    const tx = makeFakeTx(store) as any;
    const fy1 = await nextDocNumber(tx, "invoice", new Date("2026-12-01T00:00:00Z"));
    const fy2 = await nextDocNumber(tx, "invoice", new Date("2027-04-01T00:00:00Z"));
    expect(fy1.formatted).toBe("INV/2026-27/0001");
    expect(fy2.formatted).toBe("INV/2027-28/0001");
  });

  it("separate counters per series in the same FY", async () => {
    const store = new Map<string, Row>();
    const tx = makeFakeTx(store) as any;
    const d = new Date("2026-07-02T00:00:00Z");
    const inv = await nextDocNumber(tx, "invoice", d);
    const dn = await nextDocNumber(tx, "dn", d);
    expect(inv.formatted).toBe("INV/2026-27/0001");
    expect(dn.formatted).toBe("DN/2026-27/0001");
  });
});
