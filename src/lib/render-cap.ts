/**
 * Long lists rendered in steps (lot performance, P1-6 / P2-10): a list shows
 * its first `RENDER_STEP` rows, then « Afficher les N suivants » adds the
 * next ones. Only the drawing is capped — the list itself (its count, its
 * filters, its order, its notices) is still the whole list.
 *
 * A server-rendered list (the programmation queue, the bench) carries the
 * number of rows shown in the address (`?afficher=`), so the page sends only
 * those rows; a client list (/commercial) keeps it in its state.
 *
 * Pure and client-safe.
 */

/** Rows drawn at first, and added by each « Afficher les N suivants ». */
export const RENDER_STEP = 100;

/** The address parameter of a server-rendered list: how many rows it shows. */
export const SHOWN_PARAM = "afficher";

/** A ceiling on the parameter, so a hand-typed address cannot ask for the moon. */
const MAX_SHOWN = 100_000;

/**
 * The rows to show, read from the address: a whole number of at least
 * `RENDER_STEP`, else `RENDER_STEP`. A repeated parameter reads its first value.
 */
export function parseShown(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value.trim())) return RENDER_STEP;
  const shown = Number(value.trim());
  return Math.min(Math.max(shown, RENDER_STEP), MAX_SHOWN);
}

/** How many rows the next « Afficher les N suivants » adds: a step, or what is left. */
export function nextStep(hidden: number): number {
  return Math.max(0, Math.min(hidden, RENDER_STEP));
}

/** « Afficher les 100 suivants », « Afficher le suivant ». */
export function showMoreLabel(hidden: number): string {
  const step = nextStep(hidden);
  return step === 1 ? "Afficher le suivant" : `Afficher les ${step} suivants`;
}

/**
 * Cuts grouped rows after the first `limit` rows, in the order the screen
 * shows them (group after group, each group's rows in order). A group cut in
 * the middle keeps its first rows; the groups after the cut are dropped.
 * `hidden` is how many rows were left out.
 */
export function capGroups<G, T>(
  groups: readonly G[],
  limit: number,
  rowsOf: (group: G) => readonly T[],
  withRows: (group: G, rows: T[]) => G
): { groups: G[]; hidden: number } {
  const kept: G[] = [];
  let left = Math.max(0, limit);
  let hidden = 0;
  for (const group of groups) {
    const rows = rowsOf(group);
    if (left === 0) {
      hidden += rows.length;
      continue;
    }
    if (rows.length <= left) {
      kept.push(group);
      left -= rows.length;
    } else {
      kept.push(withRows(group, rows.slice(0, left)));
      hidden += rows.length - left;
      left = 0;
    }
  }
  return { groups: kept, hidden };
}


/**
 * The address of a server list's next step: the page's own parameters (a
 * null or empty one is left out) plus `?afficher=<shown + RENDER_STEP>`.
 * No anchor: the link keeps the scroll where it is (`scroll={false}`), so
 * the new rows appear under the ones already read.
 */
export function moreHref(path: string, kept: Readonly<Record<string, string | null | undefined>>, shown: number): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(kept)) if (value) params.set(name, value);
  params.set(SHOWN_PARAM, String(shown + RENDER_STEP));
  return `${path}?${params.toString()}`;
}
