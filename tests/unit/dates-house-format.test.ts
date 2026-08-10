import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDayMonth,
  formatDateTime,
  localDateString,
} from "@/lib/format";

/**
 * The house date format is DD-MM-YYYY (Manan, 2026-08 review). These tests pin
 * it: dashes not slashes, day BEFORE month, and both parts zero-padded. The
 * dates are built from LOCAL components at midday so the assertions hold in
 * any runtime timezone (vitest does not pin TZ).
 */

/** Local-midday Date - immune to timezone shifting the calendar day. */
function localNoon(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0);
}

describe("formatDate - house DD-MM-YYYY", () => {
  it("renders a two-digit day and month with dashes", () => {
    expect(formatDate(localNoon(2026, 8, 25))).toBe("25-08-2026");
  });

  it("zero-pads a single-digit day AND a single-digit month", () => {
    expect(formatDate(localNoon(2026, 8, 5))).toBe("05-08-2026");
    expect(formatDate(localNoon(2026, 1, 1))).toBe("01-01-2026");
    expect(formatDate(localNoon(2026, 9, 9))).toBe("09-09-2026");
  });

  it("puts the DAY first - 05-08 is 5 August, never 8 May", () => {
    const fifthOfAugust = formatDate(localNoon(2026, 8, 5));
    const eighthOfMay = formatDate(localNoon(2026, 5, 8));
    expect(fifthOfAugust).toBe("05-08-2026");
    expect(eighthOfMay).toBe("08-05-2026");
    expect(fifthOfAugust).not.toBe(eighthOfMay);
  });

  it("never emits slashes (Intl with a locale would)", () => {
    expect(formatDate(localNoon(2026, 12, 31))).not.toMatch(/\//);
  });

  it("never emits a month NAME", () => {
    expect(formatDate(localNoon(2026, 8, 5))).not.toMatch(/[A-Za-z]/);
  });

  it("keeps the four-digit year", () => {
    expect(formatDate(localNoon(1999, 3, 7))).toBe("07-03-1999");
  });

  it("respects an explicit timezone", () => {
    // 2026-08-05T20:30:00Z is already 06-08 in IST (+05:30).
    const d = new Date("2026-08-05T20:30:00Z");
    expect(formatDate(d, "UTC")).toBe("05-08-2026");
    expect(formatDate(d, "Asia/Kolkata")).toBe("06-08-2026");
  });

  it("degrades to '-' on an invalid Date instead of throwing", () => {
    expect(formatDate(new Date("not a date"))).toBe("-");
    expect(formatDayMonth(new Date(NaN))).toBe("-");
    expect(formatDateTime(new Date("nonsense"))).toBe("-");
  });
});

describe("formatDayMonth - compact DD-MM", () => {
  it("drops the year but keeps the zero padding and the order", () => {
    expect(formatDayMonth(localNoon(2026, 8, 5))).toBe("05-08");
    expect(formatDayMonth(localNoon(2026, 11, 30))).toBe("30-11");
  });

  it("is exactly the leading five characters of the full date", () => {
    const d = localNoon(2026, 2, 3);
    expect(formatDate(d).startsWith(formatDayMonth(d))).toBe(true);
  });
});

describe("formatDateTime - DD-MM-YYYY plus clock", () => {
  it("prefixes the house date and appends a 12-hour time", () => {
    const stamp = formatDateTime(new Date("2026-08-05T09:07:00Z"), "UTC");
    expect(stamp.startsWith("05-08-2026 ")).toBe(true);
    expect(stamp).toMatch(/\b9:07\b/);
    expect(stamp.toLowerCase()).toContain("am");
  });

  it("pins to the requested timezone, not the runtime one", () => {
    const d = new Date("2026-08-05T20:30:00Z");
    expect(formatDateTime(d, "Asia/Kolkata").startsWith("06-08-2026 ")).toBe(true);
  });
});

describe("machine formats are untouched", () => {
  it("localDateString still emits sortable YYYY-MM-DD", () => {
    // Filenames, day keys and DB day-bucketing depend on this shape.
    expect(localDateString("UTC", new Date("2026-08-05T10:00:00Z"))).toBe("2026-08-05");
  });
});
