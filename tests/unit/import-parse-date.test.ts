import { describe, it, expect } from "vitest";
import { parseLegacyDate, parseImportDate } from "@/lib/import/parse-date";

describe("parseLegacyDate", () => {
  it("treats yyyy-mm-dd as IST midnight (Asia/Kolkata)", () => {
    // 2025-11-04 00:00 IST = 2025-11-03 18:30 UTC
    const d = parseLegacyDate("2025-11-04");
    expect(d.toISOString()).toBe("2025-11-03T18:30:00.000Z");
  });

  it("trims whitespace around the date", () => {
    const d = parseLegacyDate("  2025-11-04  ");
    expect(d.toISOString()).toBe("2025-11-03T18:30:00.000Z");
  });

  it("falls back to native Date for non-yyyy-mm-dd inputs", () => {
    const d = parseLegacyDate("2025-11-04T12:00:00Z");
    expect(d.toISOString()).toBe("2025-11-04T12:00:00.000Z");
  });
});

describe("parseImportDate (bulk-import cells)", () => {
  it("reads DD/MM/YYYY day-first at IST midnight", () => {
    // 05/06/2024 = 5 June 2024 (NOT 6 May). 5 Jun 00:00 IST = 4 Jun 18:30 UTC.
    const d = parseImportDate("05/06/2024");
    expect(d.toISOString()).toBe("2024-06-04T18:30:00.000Z");
  });

  it("accepts a day > 12 that native Date would reject as MM/DD", () => {
    // 13/05/2024 = 13 May 2024. 13 May 00:00 IST = 12 May 18:30 UTC.
    const d = parseImportDate("13/05/2024");
    expect(d.toISOString()).toBe("2024-05-12T18:30:00.000Z");
  });

  it("accepts DD-MM-YYYY and DD.MM.YYYY separators", () => {
    expect(parseImportDate("13-05-2024").toISOString()).toBe("2024-05-12T18:30:00.000Z");
    expect(parseImportDate("13.05.2024").toISOString()).toBe("2024-05-12T18:30:00.000Z");
  });

  it("still reads YYYY-MM-DD as IST midnight", () => {
    expect(parseImportDate("2024-06-05").toISOString()).toBe("2024-06-04T18:30:00.000Z");
  });

  it("rejects nonsense (NaN date) so the resolver flags an error", () => {
    expect(Number.isNaN(parseImportDate("not-a-date").getTime())).toBe(true);
  });
});
