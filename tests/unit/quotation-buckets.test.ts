import { describe, it, expect } from "vitest";
import {
  buildQuotationBucketTiles,
  emptyQuotationBucketCounts,
  foldQuotationBucketCounts,
  parseQuotationSelection,
  type QuotationBucketTally,
} from "@/components/quotations/quotation-buckets";
import { QUOTATION_STAGE_BUCKETS, QUOTATION_STATUS_COLORS } from "@/db/enums";

const NO_SELECTION = { bucket: null, notSentOnly: false } as const;

describe("foldQuotationBucketCounts", () => {
  it("returns all-zero counts for a fresh install", () => {
    const c = foldQuotationBucketCounts([]);
    expect(c).toEqual(emptyQuotationBucketCounts());
    expect(c.total).toBe(0);
    for (const b of QUOTATION_STAGE_BUCKETS) expect(c.byBucket[b]).toBe(0);
  });

  it("buckets sum exactly to the total", () => {
    const rows: QuotationBucketTally[] = [
      { status: "not_started", quoteSent: false, n: 4 },
      { status: "draft", quoteSent: false, n: 7 },
      { status: "need_info", quoteSent: false, n: 2 },
      { status: "pending_approval", quoteSent: false, n: 3 },
      { status: "quotation_approved", quoteSent: true, n: 11 },
      { status: "quotation_approved", quoteSent: false, n: 5 },
    ];
    const c = foldQuotationBucketCounts(rows);
    const sum = QUOTATION_STAGE_BUCKETS.reduce(
      (n, b) => n + c.byBucket[b],
      0,
    );
    expect(c.total).toBe(32);
    expect(sum).toBe(c.total);
    expect(c.byBucket.quotation_approved).toBe(16);
  });

  it("counts Not Sent across every bucket, and the approved slice of it", () => {
    const c = foldQuotationBucketCounts([
      { status: "draft", quoteSent: false, n: 7 },
      { status: "quotation_approved", quoteSent: false, n: 5 },
      { status: "quotation_approved", quoteSent: true, n: 11 },
    ]);
    // Cross-cutting: unsent drafts AND unsent approved quotes both count.
    expect(c.notSent).toBe(12);
    expect(c.approvedNotSent).toBe(5);
  });

  it("still counts a row whose status this build does not know", () => {
    const c = foldQuotationBucketCounts([
      { status: "draft", quoteSent: false, n: 2 },
      // e.g. a value appended to the pgEnum after this build shipped
      { status: "some_future_bucket" as never, quoteSent: false, n: 3 },
    ]);
    expect(c.total).toBe(5);
    expect(c.notSent).toBe(5);
    expect(c.byBucket.draft).toBe(2);
  });
});

describe("buildQuotationBucketTiles", () => {
  const counts = foldQuotationBucketCounts([
    { status: "not_started", quoteSent: false, n: 1 },
    { status: "draft", quoteSent: false, n: 2 },
    { status: "quotation_approved", quoteSent: false, n: 3 },
  ]);

  it("renders All + the house buckets, and NO Not-Sent tile", () => {
    // "Not Sent" was dropped on 2026-08-13: the register table already carries a
    // "Quote sent" Yes/No column filter and a bulk setter, so a tile for it was
    // a filter competing with a filter — and it sat among buckets while not
    // being one, so the strip never summed to its own total.
    const tiles = buildQuotationBucketTiles(counts, NO_SELECTION);
    expect(tiles.map((t) => t.key)).toEqual(["all", ...QUOTATION_STAGE_BUCKETS]);
    expect(tiles.some((t) => t.crossCutting)).toBe(false);
  });

  it("takes every bucket tone from the enum colour map", () => {
    const tiles = buildQuotationBucketTiles(counts, NO_SELECTION);
    for (const b of QUOTATION_STAGE_BUCKETS) {
      const tile = tiles.find((t) => t.key === b);
      expect(tile?.tone).toBe(QUOTATION_STATUS_COLORS[b]);
    }
  });

  it("marks All active when nothing is selected", () => {
    const tiles = buildQuotationBucketTiles(counts, NO_SELECTION);
    expect(tiles.find((t) => t.key === "all")?.active).toBe(true);
    expect(tiles.filter((t) => t.active)).toHaveLength(1);
  });

  it("links each bucket to its own filtered register", () => {
    const tiles = buildQuotationBucketTiles(counts, NO_SELECTION);
    expect(tiles.find((t) => t.key === "draft")?.href).toBe(
      "/quotations?bucket=draft",
    );
    expect(tiles.find((t) => t.key === "all")?.href).toBe("/quotations");
  });

  it("toggles the active bucket off and keeps the other axis", () => {
    const tiles = buildQuotationBucketTiles(counts, {
      bucket: "draft",
      notSentOnly: true,
    });
    // Clicking the active bucket drops the bucket but keeps ?sent=no — the flag
    // still combines with a bucket even though it no longer has a tile, because
    // the register's own "Quote sent" filter writes the same parameter.
    expect(tiles.find((t) => t.key === "draft")?.href).toBe(
      "/quotations?sent=no",
    );
    expect(tiles.find((t) => t.key === "need_info")?.href).toBe(
      "/quotations?bucket=need_info&sent=no",
    );
  });

  it("still counts the approved-and-unsent slice, tile or no tile", () => {
    // The tile is gone but the number is not: it is the one that says "we
    // approved a price and never sent it", which is the actionable one.
    expect(counts.approvedNotSent).toBe(3);
    const c = foldQuotationBucketCounts([
      { status: "draft", quoteSent: false, n: 2 },
    ]);
    expect(c.approvedNotSent).toBe(0);
  });
});

describe("parseQuotationSelection", () => {
  it("accepts known buckets and the sent flag", () => {
    expect(parseQuotationSelection({ bucket: "need_info", sent: "no" })).toEqual({
      bucket: "need_info",
      notSentOnly: true,
    });
  });

  it("ignores unknown or hostile values", () => {
    expect(parseQuotationSelection({ bucket: "'; drop table --" })).toEqual({
      bucket: null,
      notSentOnly: false,
    });
    expect(parseQuotationSelection({ sent: "maybe" }).notSentOnly).toBe(false);
    expect(parseQuotationSelection({})).toEqual({
      bucket: null,
      notSentOnly: false,
    });
  });
});
