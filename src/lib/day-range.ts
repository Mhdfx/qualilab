import { parseLabDayRange } from "./lab-day-range";
import { labDayOf } from "./lab-time";

/**
 * « Du … au … » of a list filter (/admin/envois, /reception/historique):
 * inclusive days on the LABORATORY's clock (`lib/lab-time.ts`), the clock
 * every row of those lists is printed with — and the same cut as the audit
 * journal and the accounting export (`lib/lab-day-range.ts`, which this
 * module reads). An e-mail shown « 09/10 23:40 » is therefore inside a period
 * ending on 09/10, whatever the runtime's time-zone data says (HANDOFF §9,
 * stale tzdata). /recherche still cuts on the server's clock
 * (`parseSampleSearch` / `serverIsoDay`); the two agree while the server's
 * tzdata is current.
 */
export type DayRange = {
  /** Start of the first day, or null (no lower bound). */
  from: Date | null;
  /** Last millisecond of the last day, or null (no upper bound). */
  to: Date | null;
};

/** « 2026-09-01 » → the first (or the last) instant of that lab day; anything else → null. */
export function parseDay(value: string | null | undefined, endOfDay: boolean): Date | null {
  // « 2026-02-31 » or « 07/10/2026 » are refused rather than reinterpreted.
  const day = parseLabDayRange(value, value);
  if (!day.from || !day.until) return null;
  return endOfDay ? new Date(day.until.getTime() - 1) : day.from;
}

/** Reads `du` / `au`; a period typed backwards is still the period meant. */
export function parseDayRange(du: string | null | undefined, au: string | null | undefined): DayRange {
  const from = parseDay(du, false);
  const to = parseDay(au, true);
  if (from && to && from > to) return { from: parseDay(au, false), to: parseDay(du, true) };
  return { from, to };
}

/** The Prisma filter of a date column for a range, or undefined when open on both sides. */
export function dayRangeFilter(range: DayRange): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) };
}

/** The `du` / `au` values to write back into the form and the links. */
export function dayRangeParams(range: DayRange): { du: string; au: string } {
  return { du: range.from ? labDayOf(range.from) : "", au: range.to ? labDayOf(range.to) : "" };
}
