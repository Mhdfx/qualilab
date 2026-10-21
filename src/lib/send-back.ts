import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * « Renvoyé par … » (B2): whether the validator's « Renvoyer au technicien »
 * is why the sample is on the bench now — the banner of the analysis sheet
 * and the « Renvoyé » chip of the bench lists.
 *
 * `Sample.rejectedAt` holds the last send-back and is never cleared: it
 * stays the « Renvoyé au technicien » step of the parcours
 * (`sample-timeline.ts`) when its journal row is missing, so it is not
 * rewritten here either. Whether it is still the current one is read from
 * the journal instead: the send-back is answered by the next « Résultats
 * soumis à validation » (`RESULTS_SUBMITTED`). A sample back on the bench
 * for another reason after that — « Corriger la fiche » resetting the
 * results, a cancellation then « Réactiver » — no longer shows the old
 * send-back and its date. A sample cancelled and reactivated before the
 * technician resubmitted still shows it: the validator's request is still
 * unanswered.
 */

/** The journal action that answers a send-back. */
export const SEND_BACK_ANSWERED_BY = "RESULTS_SUBMITTED";

export type SendBackState = {
  status: SampleStatus;
  rejectedAt: Date | null;
};

/**
 * Whether the sample may show a send-back at all — the only ones whose last
 * submission is worth reading (`lastSubmissionsOf`).
 */
export function maySendBack(sample: SendBackState): boolean {
  return sample.status === "EN_ANALYSE" && sample.rejectedAt !== null;
}

/**
 * The send-back is current: the sample is under analysis, a validator sent
 * it back, and no submission came after. `lastSubmittedAt` is the newest
 * `RESULTS_SUBMITTED` row on the sample (null when the journal has none —
 * the send-back then stands, as it did before this rule).
 */
export function isCurrentSendBack(sample: SendBackState, lastSubmittedAt: Date | null): boolean {
  if (!maySendBack(sample) || sample.rejectedAt === null) return false;
  return lastSubmittedAt === null || lastSubmittedAt.getTime() <= sample.rejectedAt.getTime();
}
