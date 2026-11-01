/**
 * Lot 3E — who opens what of the ONSSA report (RETOUR-LABO-28-10.md §5).
 * Pure: the page, the routes and `onssa-guards.test.ts` read the same lists.
 *
 * - The monthly report (screen « Rapport ONSSA » and its Excel, N3): the
 *   Direction, the administrator and the validateur — the quality side.
 * - The correspondences (groups, families, natures, parameters → canevas,
 *   N2): the administrator only, as the rest of the catalogue.
 */

export const ONSSA_REPORT_ROLES = ["VALIDATEUR", "DIRECTION", "ADMIN"] as const;

export const ONSSA_MAPPING_ROLES = ["ADMIN"] as const;

export const ONSSA_REPORT_PATH = "/qualite/onssa";
/**
 * Not under /api/reports/: that space is the analysis reports' (amendment,
 * administrator's edit), closed to the Direction (`direction-guards.test.ts`).
 */
export const ONSSA_EXPORT_PATH = "/api/onssa/rapport";
export const ONSSA_MAPPING_PATH = "/admin/onssa";

/** The day that puts a sample in a month, in words (screen and « Notes »). */
export function onssaCountBasisLabel(basis: "RECEPTION" | "VALIDATION"): string {
  return basis === "VALIDATION" ? "date de validation administrative" : "date de réception";
}
