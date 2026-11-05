import type { CancelReason } from "@/generated/prisma/enums";

/**
 * What becomes of a non-conform sample that is NOT analysed — pure, shared
 * by the reception of a série, the deposit at the counter, the release of a
 * held sample, the bon de réception, the parcours and the client's e-mail.
 *
 * Two outcomes (RETOUR-LABO-04-11.md, I9 — answer R-9 of 04/11):
 * - « Détruire » → `DETRUIT_A_RECEPTION`: the laboratory destroys it
 *   (RETOUR-LABO-29-09.md, slice E);
 * - « Rejeter (rendu au client) » → `REJETE_A_RECEPTION`: refused at arrival
 *   and given back to the client, neither analysed nor destroyed by the
 *   laboratory.
 *
 * Both are received and numbered (they print on the bon), then cancelled at
 * once: ANNULE keeps them out of the bench, the programme, the invoice and
 * the ONSSA report like any cancelled sample. The client is told by the same
 * e-mail, which says which of the two happened to each line.
 */

export type ReceptionCancelReason = Extract<CancelReason, "DETRUIT_A_RECEPTION" | "REJETE_A_RECEPTION">;

/** The two motifs only a reception decision sets — never offered by « Annuler ». */
export const RECEPTION_CANCEL_REASONS = ["DETRUIT_A_RECEPTION", "REJETE_A_RECEPTION"] as const satisfies readonly ReceptionCancelReason[];

/** The decisions that cancel the sample at once, and the motif each writes. */
export const CANCELLING_DECISIONS = {
  DETRUIRE: "DETRUIT_A_RECEPTION",
  REJETER: "REJETE_A_RECEPTION",
} as const satisfies Record<string, ReceptionCancelReason>;

/** The motif a decision writes, or null when the sample is analysed or held. */
export function receptionCancelReason(decision: string): ReceptionCancelReason | null {
  if (decision === "DETRUIRE" || decision === "REJETER") return CANCELLING_DECISIONS[decision];
  return null;
}

/** Whether a cancellation motif is one of the reception's (destroyed or rejected). */
export function isReceptionCancel(reason: string | null | undefined): reason is ReceptionCancelReason {
  return typeof reason === "string" && (RECEPTION_CANCEL_REASONS as readonly string[]).includes(reason);
}

/** The bon de réception's « Échantillons non conformes » row, after the motif: « — détruit », « — rejeté, rendu au client ». */
export const NOT_ANALYSED_SUFFIX = {
  DETRUIT_A_RECEPTION: "détruit",
  REJETE_A_RECEPTION: "rejeté, rendu au client",
} as const satisfies Record<ReceptionCancelReason, string>;

/** The bon's « Résultat » cell of a line not analysed, and the e-mail's « Suite donnée ». */
export const NOT_ANALYSED_OUTCOME = {
  DETRUIT_A_RECEPTION: "Détruit à réception",
  REJETE_A_RECEPTION: "Rejeté — rendu au client",
} as const satisfies Record<ReceptionCancelReason, string>;
