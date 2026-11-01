import type { ResultWorkStatus } from "@/generated/prisma/enums";

/**
 * The note of an analysis (`Result.note`) is INTERNAL since the
 * laboratory's answer of 28/10 to the re-ask 2.20 (h) — « Oui = la note
 * devient interne » (RETOUR-LABO-28-10.md G2). The technician writes it at
 * the bench (« Ajouter une note »), the validator reads it on the
 * validation page and the parcours counts it; the report never prints it
 * (`loadReportData` writes `note: null` in every new version — a version
 * issued before keeps its frozen note). What is meant for the client goes
 * in the conclusion. The same column carries the description of an
 * anomaly (`workStatus` ANOMALIE), required then.
 */

/** The field's label, a note that is not an anomaly's description. */
export const INTERNAL_NOTE_LABEL = "Note interne";

/** The hint under the field: who reads it, and where the client's words go. */
export const INTERNAL_NOTE_HINT =
  "Non imprimée sur le rapport : lue par le validateur. Ce qui est destiné au client passe par la conclusion.";

/**
 * Whether the bench shows the note's field on a line: always for an
 * anomaly (its description is required), for a line that already carries a
 * note, and once « Ajouter une note » was clicked; otherwise the button.
 */
export function showsNoteField(line: { workStatus: ResultWorkStatus; note: string }, opened: boolean): boolean {
  return line.workStatus === "ANOMALIE" || line.note.trim() !== "" || opened;
}
