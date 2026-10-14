import type { Role } from "./roles";

/**
 * Who keeps a client's list of sites — the client fiche (`SitesManager`):
 * they alone may record a site already deactivated.
 */
export const SITE_KEEPER_ROLES = ["GESTIONNAIRE", "ADMIN"] as const satisfies readonly Role[];

/**
 * Whether a site created through `POST /api/clients/[id]/sites` is active.
 *
 * The préleveur and the reception create the site they are about to sample
 * or receive for (« + Nouveau site… » of the visit and of the deposit): it
 * is always active, whatever the request says (retour du 14/10, R3). A
 * deactivated site is never proposed by the forms and is refused to a série,
 * so it would only block the same name the next time.
 */
export function createdSiteActive(role: Role, requested: boolean): boolean {
  return (SITE_KEEPER_ROLES as readonly Role[]).includes(role) ? requested : true;
}
