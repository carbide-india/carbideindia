/**
 * Display helpers for /admin/sessions.
 *
 * All timestamps are rendered on the SERVER (the page is force-dynamic) and
 * handed to the client as plain strings. Client-side relative-time rendering
 * would hydrate differently on every tick and the server/client clocks and
 * timezones do not have to agree - strings avoid the whole class of bug.
 */

const STAMP_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "04 Aug 2026, 3:42 pm" in IST - the office timezone, always. */
export function sessionStamp(d: Date): string {
  return STAMP_FMT.format(d);
}

/**
 * Coarse relative age: "just now", "12 min ago", "3 h ago", "6 d ago".
 * Coarse on purpose - a session list is scanned, not read to the second.
 */
export function sessionAge(d: Date, now: Date = new Date()): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} y ago`;
}
