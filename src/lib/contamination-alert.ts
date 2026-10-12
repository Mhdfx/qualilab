import type { Prisma } from "@/generated/prisma/client";
import type { Interpretation } from "@/generated/prisma/enums";

/**
 * Which results raise a contamination alert — pure, one rule for the
 * dispatch (`sendContaminationAlerts`) and the validation screen's count.
 *
 * A sensitive germ (`alertOnExceed`) judged over its limit: officially
 * (`conform: false`, which every « Non satisfaisant » verdict sets, and a
 * technician's « Non conforme » on a germ without criterion) or only
 * indicatively (too few units, RETOUR-LABO-29-09.md §3).
 *
 * It reads verdicts, never `numericValue`: an « Indénombrable » plate has no
 * number at all and must alert all the same — the lesson of the 09/09
 * audit, where a fix silently lost alerts.
 */
export type AlertCandidate = {
  conform: boolean | null;
  informalInterpretation: Interpretation | null;
  parameter: { alertOnExceed: boolean };
};

export function raisesContaminationAlert(result: AlertCandidate): boolean {
  if (!result.parameter.alertOnExceed) return false;
  return result.conform === false || result.informalInterpretation === "NON_SATISFAISANT";
}

/** `raisesContaminationAlert`, as the database filters it. */
export const ALERT_RESULT_WHERE: Prisma.ResultWhereInput = {
  parameter: { alertOnExceed: true },
  OR: [{ conform: false }, { informalInterpretation: "NON_SATISFAISANT" }],
};
