/**
 * Parse a legacy 'yyyy-mm-dd' string as Asia/Kolkata midnight, so the
 * imported created_at / due_at reflect IST calendar dates, not UTC.
 *
 * Without this, `new Date("2025-11-04")` parses as UTC midnight, which
 * renders as 2025-11-03 in IST (UTC+5:30) - every date in every view
 * would shift back one calendar day.
 *
 * Falls back to the native `Date` constructor for any other input shape
 * (full ISO strings with explicit offsets, etc.) - the caller is
 * expected to validate the result with `isNaN(d.getTime())`.
 */
export function parseLegacyDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(`${raw.trim()}T00:00:00+05:30`);
  }
  return new Date(raw);
}

/**
 * Parse a bulk-import date cell IST-safe, accepting the two formats the import
 * UI advertises: `YYYY-MM-DD` and DAY-FIRST `DD/MM/YYYY` (also `DD-MM-YYYY` /
 * `DD.MM.YYYY`) — the Indian convention. Raw `new Date("05/06/2024")` would read
 * that as MM/DD (5 June → wrongly May 6) or reject day > 12; this reads it as
 * 5 June and anchors to IST midnight so the stored calendar date can't shift a
 * day. Any other shape (a full ISO string, etc.) falls back to the native
 * constructor; callers validate with `Number.isNaN(d.getTime())`.
 */
export function parseImportDate(raw: string): Date {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+05:30`);
  }
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      return new Date(`${iso}T00:00:00+05:30`);
    }
  }
  return new Date(s);
}
