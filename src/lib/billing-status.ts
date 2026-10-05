import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * The statuses an accountant may invoice (PROGRAMME.md §6).
 *
 * Since the programme d'analyse, the invoice no longer waits for the report:
 * a line is billable from the moment its programme is confirmed, at the
 * catalogue prices of the programmed analyses. Never a cancelled line, never
 * one still waiting at reception — nothing is decided on it yet.
 */
export const BILLABLE_STATUSES: readonly SampleStatus[] = [
  "PROGRAMME",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
];

/**
 * True while a line may be on an invoice without its results being
 * validated — the « Facturé avant résultat » banner of the invoice and the
 * client sheet.
 */
export function billedBeforeResult(status: SampleStatus): boolean {
  return status === "PROGRAMME" || status === "EN_ANALYSE" || status === "RESULTATS_SAISIS";
}
