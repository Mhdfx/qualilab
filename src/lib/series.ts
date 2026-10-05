import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * A série (visit or deposit) has no status of its own: this is where its
 * state is derived from its samples — the one rule that keeps the LIMS at a
 * single state machine (WORKFLOW.md, rule 1).
 */

export type SerieStatus =
  /** At least one line is still waiting at reception. */
  | "A_RECEPTIONNER"
  /** Received; analysis or validation still running on at least one line. */
  | "EN_COURS"
  /** Every remaining line is validated or sent. */
  | "TERMINEE"
  /** Every line was cancelled. */
  | "ANNULEE";

export const SERIE_STATUS_LABELS: Record<SerieStatus, string> = {
  A_RECEPTIONNER: "À réceptionner",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

export type SerieProgress = {
  total: number;
  annules: number;
  aReceptionner: number;
  enCours: number;
  termines: number;
};

/** Received and not yet validated — the programme step included (PROGRAMME.md §6). */
const OPEN: SampleStatus[] = ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"];
const DONE: SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];

export function serieProgress(
  samples: { status: SampleStatus }[]
): SerieProgress {
  const progress: SerieProgress = {
    total: samples.length,
    annules: 0,
    aReceptionner: 0,
    enCours: 0,
    termines: 0,
  };
  for (const { status } of samples) {
    if (status === "ANNULE") progress.annules += 1;
    else if (status === "PRELEVE") progress.aReceptionner += 1;
    else if (OPEN.includes(status)) progress.enCours += 1;
    else if (DONE.includes(status)) progress.termines += 1;
  }
  return progress;
}

export function serieStatus(samples: { status: SampleStatus }[]): SerieStatus {
  const p = serieProgress(samples);
  if (p.total > 0 && p.annules === p.total) return "ANNULEE";
  if (p.aReceptionner > 0) return "A_RECEPTIONNER";
  if (p.enCours > 0) return "EN_COURS";
  if (p.termines > 0) return "TERMINEE";
  // An empty série cannot exist (a série is created with its lines); treat
  // the impossible as "waiting" so it shows up rather than disappears.
  return "A_RECEPTIONNER";
}

/**
 * The most units one sample may carry. The laboratory wants no limit
 * (RETOUR-LABO-29-09.md, point 11): this is only a technical ceiling that
 * keeps a typing slip (« 5000 ») from creating thousands of readings.
 */
export const MAX_UNITS = 999;

/**
 * A unit's name everywhere — report, bench, reception, labels: R1 … Rn
 * (answers of the laboratory of 29/09, point 9, and 30/09, Q36).
 */
export function repetitionLabel(index: number) {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Indice d'unité hors limites : ${index}`);
  }
  return `R${index}`;
}

/** « R1–R5 » for a line of five units, « R1 » for one. */
export function repetitionRange(unitCount: number) {
  return unitCount > 1 ? `${repetitionLabel(1)}–${repetitionLabel(unitCount)}` : repetitionLabel(1);
}

/** Line reference the préleveur sees: « 2780/26 · ligne 3 ». */
export function lineReference(serialNumber: string, lineNumber: number) {
  return `${serialNumber} · ligne ${lineNumber}`;
}
