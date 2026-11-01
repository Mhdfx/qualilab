import { isoDayOf, parseIsoDay } from "./date-only";
import { labDayStart } from "./lab-day-range";
import { labDayOf } from "./lab-time";

/**
 * How long ago a sample was received, at the bench (lot 3B, G5 — 18/10
 * re-ask 2.20 (k), answered « Oui » on 28/10): the filter « Reçus depuis plus
 * de N jours » on the technician's lists and « reçu il y a N j » on each
 * row. Calendar days on the laboratory's clock (`lab-time.ts`), the clock
 * every screen prints its times with: a sample received yesterday at 23:50
 * is « il y a 1 j » this morning, whatever the hour. Pure.
 */

/** The address parameter of the filter: `/technicien?recus=3`. */
export const RECEIVED_AGE_PARAM = "recus";

/** The largest N the filter accepts — a year. */
export const MAX_RECEIVED_AGE = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** N asked for in the address: a whole number from 1 to 365, else no filter (null). */
export function parseReceivedAge(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\s*\d{1,3}\s*$/.test(value)) return null;
  const days = Number(value);
  return days >= 1 && days <= MAX_RECEIVED_AGE ? days : null;
}

/** Calendar days between the laboratory's day of `receivedAt` and today's: 0 = today. */
export function receivedDaysAgo(receivedAt: Date, now: Date): number {
  const received = parseIsoDay(labDayOf(receivedAt));
  const today = parseIsoDay(labDayOf(now));
  if (!received || !today) return 0;
  return Math.max(0, Math.round((today.getTime() - received.getTime()) / DAY_MS));
}

/**
 * The instant a sample must have been received before to be « reçu depuis
 * plus de N jours » — midnight on the laboratory's clock opening the day N
 * days before today: received before it ⇔ `receivedDaysAgo` > N.
 */
export function receivedBefore(days: number, now: Date): Date {
  const today = parseIsoDay(labDayOf(now));
  const day = today ? isoDayOf(new Date(today.getTime() - days * DAY_MS)) : labDayOf(now);
  return labDayStart(day) ?? now;
}

/** « reçu aujourd'hui », « reçu il y a 1 j », « reçu il y a 12 j ». */
export function receivedAgeText(days: number): string {
  return days <= 0 ? "reçu aujourd'hui" : `reçu il y a ${days} j`;
}

/** The filter's label: « Reçus depuis plus de 3 jours ». */
export function receivedAgeLabel(days: number): string {
  return `Reçus depuis plus de ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * A bench address with the filter set or removed, the tile's view and the
 * list's anchor kept: `/technicien?vue=en_analyse&recus=3#analyses`.
 */
export function receivedAgeHref(path: string, view: string | null, days: number | null, anchor?: string): string {
  const params = new URLSearchParams();
  if (view) params.set("vue", view);
  if (days !== null) params.set(RECEIVED_AGE_PARAM, String(days));
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${anchor ? `#${anchor.replace(/^#/, "")}` : ""}`;
}
