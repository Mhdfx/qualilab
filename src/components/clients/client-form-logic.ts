import { siteAddressHint } from "@/lib/email-recipients";

/**
 * The client form's decisions about a recipient's site (RETOUR-LABO-19-10.md
 * H3, Q45) — pure, so they are tested without a browser. Each address of the
 * list is the whole client's (« Tout le client ») or one of its sites'
 * (« Site : X »): a site's address receives that site's mail only (D-04,
 * `src/lib/email-recipients.ts`, unchanged). The server checks the site
 * belongs to the client (PATCH /api/clients/[id], `emailSitesRefusal`).
 */

/** A site of the client, as the form lists it. */
export type SiteOption = { id: string; name: string; active: boolean };

/** The choice « Tout le client » (no site). */
export const WHOLE_CLIENT_LABEL = "Tout le client";

/**
 * The sites an address may be given: the client's active sites, plus an
 * inactive one an address already belongs to (else the select could not
 * show it, and the save would move the address). Offered on every row, as
 * the server accepts it on any (`emailSitesRefusal`). Active first, by name.
 */
export function siteOptions(sites: readonly SiteOption[], boundSiteIds: readonly (string | null)[]): SiteOption[] {
  const bound = new Set(boundSiteIds.filter((id): id is string => id !== null));
  return sites
    .filter((site) => site.active || bound.has(site.id))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"));
}

/** « Site : X », « Site : X (désactivé) ». */
export function siteOptionLabel(site: SiteOption): string {
  return `Site : ${site.name}${site.active ? "" : " (désactivé)"}`;
}

/**
 * The sentence under an address's site choice, or null. `savedSiteId`: the
 * site the address had when the form opened. A site's address says what it
 * receives (the boxes beneath it); an address taken from its site back to
 * the whole client warns that it will then receive every site's mail.
 */
export function emailSiteHint(
  row: { email: string; siteId: string | null; savedSiteId: string | null; forReports: boolean; forAlerts: boolean },
  sites: readonly SiteOption[]
): { kept: boolean; text: string } | null {
  const nameOf = (id: string | null) => (id ? (sites.find((site) => site.id === id)?.name ?? null) : null);
  const chosen = nameOf(row.siteId);
  // The binding is the select's now: the address keeps it whatever is typed.
  if (chosen) return siteAddressHint(chosen, row.email, row.email, row);
  const saved = nameOf(row.savedSiteId);
  if (row.siteId === null && saved) {
    return {
      kept: false,
      text: `Adresse générale : elle ne sera plus réservée au site ${saved} et, cochée, recevra les envois de tous les sites.`,
    };
  }
  return null;
}
