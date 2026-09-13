import type { NavSection } from "./nav-types";

/** Path part of a nav href: "/reception#file" → "/reception". */
function pathOf(href: string) {
  return href.split("#")[0];
}

/** Segment-wise prefix: "/reception" covers "/reception/abc", not "/receptionnaire". */
function covers(path: string, pathname: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * The single nav item to highlight for the current URL: the one whose href
 * is the LONGEST route prefix of the pathname. On /comptabilite/factures/nouvelle
 * « Nouvelle facture » wins over « Factures »; an administrator browsing
 * /reception/abc sees « Réception » lit in the administration menu. Among
 * items sharing that path (a dashboard and its "#anchor" shortcuts) the plain
 * link wins.
 *
 * Returns the item's href, or null when nothing on the menu matches.
 */
export function activeHref(pathname: string, sections: NavSection[]): string | null {
  let best: { href: string; path: string } | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (!item.href || item.disabled) continue;
      const path = pathOf(item.href);
      if (!covers(path, pathname)) continue;

      const longer = best === null || path.length > best.path.length;
      const plainerSibling =
        best !== null &&
        path === best.path &&
        best.href.includes("#") &&
        !item.href.includes("#");
      if (longer || plainerSibling) best = { href: item.href, path };
    }
  }

  return best?.href ?? null;
}
