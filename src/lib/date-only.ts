/**
 * Calendar dates without a time (DLC, document versions, norm versions),
 * stored in `@db.Date` columns.
 *
 * The database adapter writes a DATE from the instant's UTC parts, so a date
 * must be the UTC midnight of that day. Reading « 2024-10-01 » as LOCAL
 * midnight (`new Date("2024-10-01T00:00:00")`) is the previous day in UTC on
 * any runtime whose zone is ahead of UTC — e.g. a container whose tz data
 * still puts Morocco at UTC+1 — and the stored date slips by one day on
 * every save. Pure; no time zone is involved anywhere.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * « AAAA-MM-JJ » → the UTC midnight of that day; null for anything else,
 * impossible days (2024-02-30) included.
 */
export function parseIsoDay(value: string): Date | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A stored calendar date → « AAAA-MM-JJ » (for a date input). */
export function isoDayOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A stored calendar date → « JJ/MM/AAAA » (for a printed form). */
export function formatDateOnly(date: Date): string {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
