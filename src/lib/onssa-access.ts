import { ONSSA_EXPORT_LAYOUT } from "./lab-proposals";

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

/**
 * Lot 6C, N6 — the two Excel of the report: « canevas » (the complete
 * canevas of 2026, `onssa-canevas-workbook.ts`) and « extrait » (the extract
 * of 28/10, lot 3E, `onssa-workbook.ts`).
 */
export type OnssaExportFormat = "canevas" | "extrait";

/** The format a download gives without `?format=` (`ONSSA_EXPORT_LAYOUT`). */
export function defaultOnssaExportFormat(): OnssaExportFormat {
  return ONSSA_EXPORT_LAYOUT === "CANEVAS_2026" ? "canevas" : "extrait";
}

/** `?format=` read: absent → the default; « canevas » / « extrait »; anything else → null (refused). */
export function onssaExportFormat(value: string | null | undefined): OnssaExportFormat | null {
  const asked = (value ?? "").trim().toLowerCase();
  if (!asked) return defaultOnssaExportFormat();
  return asked === "canevas" || asked === "extrait" ? asked : null;
}

/** The download link of a month in a format. */
export function onssaExportHref(month: string, format: OnssaExportFormat): string {
  return `${ONSSA_EXPORT_PATH}?mois=${month}&format=${format}`;
}
