/**
 * The laboratory's wall clock, independent of the device's time-zone data.
 *
 * Morocco left permanent UTC+1 on 20 September 2026 at 02:00 (décret
 * n° 2.26.530, IANA tzdata 2026c): since then the legal time is plain UTC.
 * Browsers and PCs that have not received that update still apply UTC+1 to
 * « Africa/Casablanca », so a page rendered on the server (up to date) and a
 * page rendered in such a browser would disagree by one hour — and a
 * `datetime-local` typed there would land one hour early.
 *
 * Every timestamp therefore goes through here: dates before the switch keep
 * the IANA zone (its history is the same everywhere), dates after it use
 * UTC explicitly, which is what the zone resolves to on current data.
 */
export const MOROCCO_GMT_SWITCH = Date.UTC(2026, 8, 20, 1, 0, 0);

/** The zone to hand to Intl for a given instant. */
export function labTimeZone(date: Date): string {
  return date.getTime() >= MOROCCO_GMT_SWITCH ? "UTC" : "Africa/Casablanca";
}

const PARTS = new Map<string, Intl.DateTimeFormat>();
function parts(zone: string, date: Date) {
  let format = PARTS.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS.set(zone, format);
  }
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

/** Minutes east of UTC that the laboratory's clock shows at `date`. */
export function labOffsetMinutes(date: Date): number {
  if (date.getTime() >= MOROCCO_GMT_SWITCH) return 0;
  const p = parts("Africa/Casablanca", date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The wall time of `date` on the laboratory's clock, as `datetime-local` wants it: 2026-10-05T14:05. */
export function toLabWallTime(date: Date): string {
  const shifted = new Date(date.getTime() + labOffsetMinutes(date) * 60000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** The instant a wall time typed on the laboratory's clock denotes; null when unreadable. */
export function fromLabWallTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value?.trim() ?? "");
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(naive)) return null;
  // Before the switch the clock was ahead of UTC: the instant is earlier
  // than the naive reading. One correction pass is enough — the offset only
  // changes at a handful of instants a year.
  const first = new Date(naive - labOffsetMinutes(new Date(naive)) * 60000);
  return new Date(naive - labOffsetMinutes(first) * 60000);
}
