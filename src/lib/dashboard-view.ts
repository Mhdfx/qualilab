/**
 * Dashboard tiles as sorts (retour du laboratoire : « rendre tous les blocs
 * de tous les dashboards cliquables comme un tri »).
 *
 * When a tile counts rows of a list shown on the same page, clicking it
 * filters that list in place through the address: `?vue=<clé>` plus the
 * list's anchor (`#file`, `#analyses`, `#visites` …). The view is read on the
 * server from `searchParams` (a client dashboard receives it as a prop from
 * its server page), so a filtered list can be shared and survives a reload.
 *
 * Pure and client-safe.
 */

import { labDayBounds, labDayStart } from "./lab-day-range";
import { labDayOf } from "./lab-time";

/** The address parameter that carries a dashboard view. */
export const VIEW_PARAM = "vue";

/**
 * The view asked for in the address, or null when there is none or it is not
 * one of the page's views. `allowed` is either the list of keys or the
 * page's `{ clé: libellé }` record, so the label of the view is at hand:
 *
 * ```ts
 * const VIEWS = { a_programmer: "À programmer", retard: "En retard" } as const;
 * const view = parseView((await searchParams).vue, VIEWS); // "retard" | "a_programmer" | null
 * ```
 *
 * A repeated parameter (`?vue=a&vue=b`) reads its first value, like the
 * other list filters of the application.
 */
export function parseView<const K extends string>(
  raw: unknown,
  allowed: readonly K[] | Readonly<Record<K, unknown>>
): K | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key) return null;
  const known = Array.isArray(allowed)
    ? (allowed as readonly string[]).includes(key)
    : Object.prototype.hasOwnProperty.call(allowed, key);
  return known ? (key as K) : null;
}

/**
 * The link of a view: `viewHref("/programmation", "retard", "file")` →
 * `/programmation?vue=retard#file`. A null view is the unfiltered list
 * (« Tout afficher »): `viewHref("/programmation", null, "file")` →
 * `/programmation#file`.
 */
export function viewHref(path: string, view: string | null, anchor?: string): string {
  const query = view ? `?${new URLSearchParams({ [VIEW_PARAM]: view }).toString()}` : "";
  const hash = anchor ? `#${anchor.replace(/^#/, "")}` : "";
  return `${path}${query}${hash}`;
}

/**
 * « Reçus aujourd'hui »: the laboratory's today (`lib/lab-time.ts`), first to
 * last millisecond, and its « AAAA-MM-JJ » for the tile's /recherche link —
 * the clock /recherche reads `du` / `au` back with (`parseSampleSearch`), so
 * the link opens exactly what the tile counted, whatever the server's zone
 * data (retouche of 02/11; was the server's own midnight).
 */
export function labToday(now: Date): { day: string; from: Date; to: Date } {
  const bounds = labDayBounds(null, now)!;
  return { day: bounds.day, from: bounds.from, to: new Date(bounds.until.getTime() - 1) };
}

/** « Ce mois-ci »: the first instant of the laboratory's month, and its « AAAA-MM-01 » for the link. */
export function labMonthStart(now: Date): { day: string; from: Date } {
  const day = `${labDayOf(now).slice(0, 7)}-01`;
  return { day, from: labDayStart(day)! };
}
