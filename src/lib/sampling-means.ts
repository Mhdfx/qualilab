import type { AirMethod, LineKind } from "@/generated/prisma/enums";
import { airMethodText } from "./labels";
import { SAMPLING_MEANS_BY_KIND } from "./lab-proposals";

/**
 * « Moyen de prélèvement » on the report (RETOUR-LABO-28-10.md K6 — Q104 (d),
 * « 2 cas : le prélèvement effectué par nous ou par le client »; the list of
 * means to confirm by R-27, `SAMPLING_MEANS_BY_KIND`):
 *
 * - the laboratory sampled: « Écouvillon » for a surface or hands,
 *   « Flacon stérile » for water, « Sachet stérile ou emballage d'origine »
 *   for food — « N/A » for a line of another kind;
 * - the client or a third party sampled: « N/A »;
 * - the air keeps its method whoever is named (« Boîte exposée 30 min »,
 *   « Biocollecteur »), « N/A » when it was not recorded.
 *
 * Pure. Frozen with each report issued since lot 3C (`ReportData.samplingMeans`):
 * a version issued before keeps the print it had.
 */

/** The means the laboratory uses, per kind of line (proposal of 18/10, R-27). */
export const SAMPLING_MEANS: Partial<Record<LineKind, string>> = {
  SURFACE: "Écouvillon",
  MAINS: "Écouvillon",
  EAU: "Flacon stérile",
  ALIMENT: "Sachet stérile ou emballage d'origine",
};

/** The template's « Non applicable ». */
export const MEANS_NOT_APPLICABLE = "N/A";

export type SamplingMeansInput = {
  lineKind: LineKind | null | undefined;
  /** The laboratory's préleveur sampled (`samplerKind === "QUALILAB"`). */
  sampledByLab: boolean;
  airMethod?: AirMethod | null;
  airExposureMin?: number | null;
};

export function samplingMeansText(input: SamplingMeansInput, byKind: boolean = SAMPLING_MEANS_BY_KIND): string {
  if (input.lineKind === "AIR") {
    return input.airMethod ? airMethodText(input.airMethod, input.airExposureMin) : MEANS_NOT_APPLICABLE;
  }
  if (!byKind || !input.sampledByLab || !input.lineKind) return MEANS_NOT_APPLICABLE;
  return SAMPLING_MEANS[input.lineKind] ?? MEANS_NOT_APPLICABLE;
}
