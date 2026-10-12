import { isoDayOf, parseIsoDay } from "./date-only";
import { fromLabWallTime, labDayOf } from "./lab-time";

/**
 * A period typed as two calendar days (`du` / `au`, inclusive) → the
 * instants that bound it on the laboratory's clock (`lib/lab-time.ts`): the
 * same clock every screen prints its times with, so an entry shown « 09/10
 * 23:40 » is inside a period ending on 09/10 — whatever the runtime's time
 * zone data says (HANDOFF §9, stale tzdata). Pure.
 */

export type LabDayRange = {
  /** « AAAA-MM-JJ » as asked, after putting a backwards period right. */
  fromDay: string | null;
  toDay: string | null;
  /** Midnight opening `fromDay`, and midnight opening the day AFTER `toDay` (exclusive). */
  from: Date | null;
  until: Date | null;
};

/** The instant a calendar day starts on the laboratory's clock; null when it is not a real day. */
export function labDayStart(day: string | null): Date | null {
  return day && parseIsoDay(day) ? fromLabWallTime(`${day}T00:00`) : null;
}

/** « 2026-12-31 » → « 2027-01-01 ». */
function nextIsoDay(day: string): string | null {
  const date = parseIsoDay(day);
  return date ? isoDayOf(new Date(date.getTime() + 24 * 60 * 60 * 1000)) : null;
}

/**
 * `du` / `au` → the period. A day that does not exist is ignored (the period
 * stays open on that side); a period typed backwards is the period meant.
 */
export function parseLabDayRange(du: string | null | undefined, au: string | null | undefined): LabDayRange {
  let fromDay = du && parseIsoDay(du.trim()) ? du.trim() : null;
  let toDay = au && parseIsoDay(au.trim()) ? au.trim() : null;
  if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const after = toDay ? nextIsoDay(toDay) : null;
  return {
    fromDay,
    toDay,
    from: labDayStart(fromDay),
    until: labDayStart(after),
  };
}

/**
 * The one day of a daily document (`?date=` of the feuille de paillasse):
 * the day asked, or the laboratory's today when none is — never the
 * runtime's local midnight, which stale tzdata puts an hour early and whose
 * date then prints as the day before (HANDOFF §9). Null when the day asked
 * is not a real one.
 */
export function labDayBounds(
  day: string | null | undefined,
  now: Date
): { day: string; from: Date; until: Date } | null {
  const wanted = day ? day.trim() : labDayOf(now);
  const range = parseLabDayRange(wanted, wanted);
  return range.fromDay && range.from && range.until ? { day: range.fromDay, from: range.from, until: range.until } : null;
}
