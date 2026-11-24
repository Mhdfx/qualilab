/**
 * A page shown again from the router's cache (browser Back / Forward) is the
 * render it was when it was left: since the lot performance the dashboards
 * read their first rows with the page (P2-7), Back could show « À prendre » with
 * a sample just taken, or « Mes visites » without the visit just created
 * (review of the lot, points 3 and 4).
 *
 * Each render of such a page carries an id of its own (`newRenderId`). The
 * page remembers the ids it has shown; one shown a second time is a render
 * restored from the cache — the page then asks the server again, once. A
 * forward navigation, or a Back the router could not serve from its cache,
 * brings a new render, a new id: nothing more is asked.
 *
 * Pure and client-safe.
 */

/** How many render ids a tab remembers: the oldest are forgotten past it. */
export const RENDER_IDS_KEPT = 200;

/** A fresh id for one server render of a page. */
export function newRenderId(): string {
  return crypto.randomUUID();
}

const shownRenders = new Set<string>();

function remember(seen: Set<string>, renderId: string) {
  seen.add(renderId);
  if (seen.size > RENDER_IDS_KEPT) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
}

/**
 * Called when the page's render `renderId` is shown (an effect's body; the
 * answer is its cleanup). A render shown before is refreshed (`refresh`),
 * once — it is forgotten, the refresh brings a render of its own; a new one
 * is remembered on the next tick — not at once, so React's development
 * double mount (mount, unmount, mount) neither takes a first showing for a
 * second one nor refreshes a restored render twice.
 */
export function watchRender(renderId: string, refresh: () => void, seen: Set<string> = shownRenders): () => void {
  if (seen.has(renderId)) {
    seen.delete(renderId);
    refresh();
    return () => {};
  }
  const handle = setTimeout(() => remember(seen, renderId), 0);
  return () => clearTimeout(handle);
}
