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
 * « AAAA-MM-JJ » of a day boundary the server cut with `setHours(0, 0, 0, 0)`
 * (« Reçus aujourd'hui », « Ce mois-ci »), read on that same server clock —
 * the clock /recherche reads `du` / `au` back with (`parseSampleSearch`) —
 * so a tile's link opens exactly the instant the tile counted from. Pass it
 * to `rechercheHref` as a string. Identical to `formatIsoDay` while the
 * runtime's zone data and the lab's clock (`lab-time.ts`) agree; when they do
 * not (a runtime predating Morocco's return to UTC), `formatIsoDay` of server
 * midnight reads the previous day and the link would open one day early.
 */
export function serverIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
