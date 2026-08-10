const numberFmt = new Intl.NumberFormat("en-IN");

export function formatCount(n: number): string {
  return numberFmt.format(n);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

// ---------------------------------------------------------------------------
// House date format: DD-MM-YYYY (Manan, 2026-08 review: "इधर भी डीडी एमएम
// वाईवाईवाईवाई ही रखो"). Every human-facing date in the app goes through the
// helpers below so one change governs the whole product.
//
// The parts are assembled by hand rather than handed to a locale: en-GB and
// en-IN both render "05/08/2026" with slashes, and en-CA renders the machine
// order YYYY-MM-DD. formatToParts gives us the zero-padded pieces and we join
// them with dashes ourselves.
//
// These format in the RUNTIME timezone by default (Vercel runs UTC), which is
// the behaviour every existing call site already had. Pass `timeZone` where a
// screen must pin a date to the office day (see formatTimeInTz / localDateString).
// ---------------------------------------------------------------------------

const DMY_OPTS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
} as const satisfies Intl.DateTimeFormatOptions;

const SHORT_TIME_OPTS = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
} as const satisfies Intl.DateTimeFormatOptions;

// Intl.DateTimeFormat construction is the expensive part - cache one instance
// per timezone. "" is the key for "runtime timezone, no override".
const dmyCache = new Map<string, Intl.DateTimeFormat>();
const shortTimeCache = new Map<string, Intl.DateTimeFormat>();

function cachedFmt(
  cache: Map<string, Intl.DateTimeFormat>,
  opts: Intl.DateTimeFormatOptions,
  timeZone: string | undefined,
): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  const hit = cache.get(key);
  if (hit) return hit;
  const fmt = new Intl.DateTimeFormat("en-GB", timeZone ? { ...opts, timeZone } : opts);
  cache.set(key, fmt);
  return fmt;
}

/**
 * `new Date("")` / `new Date(undefined as never)` are real Date objects whose
 * time is NaN - Intl throws RangeError on them. Registers render plenty of
 * dates that came off the wire, so guard instead of blowing up the page.
 */
function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Pull the zero-padded day/month/year out of a formatter. */
function dmyParts(d: Date, fmt: Intl.DateTimeFormat): { day: string; month: string; year: string } {
  let day = "";
  let month = "";
  let year = "";
  for (const part of fmt.formatToParts(d)) {
    if (part.type === "day") day = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "year") year = part.value;
  }
  return { day, month, year };
}

/** House date: DD-MM-YYYY, zero-padded (e.g. "05-08-2026"). "-" if invalid. */
export function formatDate(d: Date, timeZone?: string): string {
  if (!isValidDate(d)) return "-";
  const { day, month, year } = dmyParts(d, cachedFmt(dmyCache, DMY_OPTS, timeZone));
  return `${day}-${month}-${year}`;
}

/**
 * Compact house date without the year: DD-MM (e.g. "05-08"). For dense strips
 * (drafts, digests, agenda sub-labels) that previously read "5 Aug".
 */
export function formatDayMonth(d: Date, timeZone?: string): string {
  if (!isValidDate(d)) return "-";
  const { day, month } = dmyParts(d, cachedFmt(dmyCache, DMY_OPTS, timeZone));
  return `${day}-${month}`;
}

/** House stamp: DD-MM-YYYY plus clock time (e.g. "05-08-2026 10:42 am"). */
export function formatDateTime(d: Date, timeZone?: string): string {
  if (!isValidDate(d)) return "-";
  const time = cachedFmt(shortTimeCache, SHORT_TIME_OPTS, timeZone).format(d);
  return `${formatDate(d, timeZone)} ${time}`;
}

/**
 * Calendar day (YYYY-MM-DD) of `d` in the given IANA timezone. Used by
 * attendance to pin a punch to the employee's own "today" regardless of
 * the server's timezone (Vercel runs UTC).
 */
export function localDateString(timeZone: string, d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Clock time of `d` in the given IANA timezone (e.g. "10:42 am"). */
export function formatTimeInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹ amount in Indian digit grouping, no paise (e.g. "₹1,25,000"). */
export function formatInr(n: number): string {
  return inrFmt.format(n);
}

export function formatDelta(n: number): string {
  if (n > 0) return `↑ ${n}`;
  if (n < 0) return `↓ ${Math.abs(n)}`;
  return `→ 0`;
}

import type { TaskStatus, StatusColorToken } from "@/db/enums";

// M5.1 - client-side fallback maps for status labels + colors. Server
// Components should call `getStatusDisplayMap()` (lib/queries/status-display.ts)
// instead so admin renames flow through. These exist for purely-client surfaces
// and as a safety net if a DB read fails.
export const STATUS_LABELS_FALLBACK: Record<TaskStatus, string> = {
  dont_know:    "Not Read",
  not_started:  "Not Started",
  initiated:    "Initiated",
  follow_up:    "Follow Up",         // legacy - kept for already-imported rows
  need_help:    "Need Help",
  on_hold:      "On Hold",
  need_info:    "Need Info",         // Tier-3 NEW
  follow_up_1:  "Follow Up 1",       // Tier-3 NEW
  follow_up_2:  "Follow Up 2",       // Tier-3 NEW
  follow_up_3:  "Follow Up 3",       // Tier-3 NEW
  done:         "Done",
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

// Manan's status colour scheme (2026-05): Not Started=light blue,
// Initiated=yellow, Need Info/Need Help=red, Follow Up 1/2/3=orange,
// Done=green, Not Approved=light red (rose), Approved=purple,
// Cancelled=dark grey (slate), Transferred=brown.
export const STATUS_TONES_FALLBACK: Record<TaskStatus, StatusColorToken> = {
  dont_know:    "stone",
  not_started:  "blue",
  initiated:    "yellow",
  follow_up:    "orange",            // legacy follow-up → orange family
  need_help:    "red",
  on_hold:      "slate",
  need_info:    "red",
  follow_up_1:  "orange",
  follow_up_2:  "orange",
  follow_up_3:  "orange",
  done:         "green",
  approved:     "purple",
  not_approved: "rose",
  cancelled:    "slate",
  transferred:  "brown",
};
