import type { CancelReason } from "@/generated/prisma/enums";
import { otherSitesMessage, type RecipientPick } from "./email-recipients";

/**
 * « Non reçu au laboratoire » told to the client — the laboratory's answer
 * of 16/10 to Q74: « un mail par un échantillon pas reçu » (RETOUR-LABO-16-10.md
 * §3.B, B4). The rules, pure and client-safe: which cancellation tells the
 * client, how one notice is delivered, and what the « Annuler » dialog says
 * afterwards. The sending itself is `not-received-notice.ts` (server only).
 */

/**
 * Whether a cancellation tells the client: « Non reçu au laboratoire » only,
 * one e-mail per sample. Never another motif — the laboratory calls the
 * client for a sample held « en attente » or analysed despite a
 * non-conformity (Q74), and a destruction has its own notice.
 */
export function cancelNotifiesClient(reason: CancelReason): boolean {
  return reason === "NON_RECU";
}

/** What a notice became: sent, simulated (no provider configured yet), failed, or not sent — nobody to send it to. */
export type NoticeStatus = "ENVOYE" | "SIMULE" | "ECHEC" | "NON_ENVOYE";

export type NoticeOutcome = { to: string[]; status: NoticeStatus; error: string | null };

/** One send to the recipients, as `sendEmail` answers it. */
export type NoticeSend = (to: string[]) => Promise<{ status: "ENVOYE" | "SIMULE" | "ECHEC"; error: string | null }>;

export const NO_ADDRESS_MESSAGE = "Aucune adresse e-mail enregistrée pour ce client.";

/**
 * Delivers one notice: exactly one send to the report recipients of the
 * série's site, or none when nobody applies — and then why: no address at
 * all, or only other sites' (D-04, `otherSitesMessage`). A send that throws
 * is a failure told in the outcome, never an exception: the cancellation it
 * follows is already written and stays.
 */
export async function deliverNotice(recipients: RecipientPick, siteId: string | null, send: NoticeSend): Promise<NoticeOutcome> {
  const { to, otherSitesOnly } = recipients;
  if (to.length === 0) {
    return { to, status: "NON_ENVOYE", error: otherSitesOnly ? otherSitesMessage("reports", siteId) : NO_ADDRESS_MESSAGE };
  }
  try {
    const result = await send(to);
    return { to, status: result.status, error: result.error };
  } catch (cause) {
    return { to, status: "ECHEC", error: cause instanceof Error ? cause.message : "Erreur inconnue" };
  }
}

/** « Aucune adresse … » → « aucune adresse … » after a colon. */
function lowerFirst(message: string): string {
  return message ? message.charAt(0).toLocaleLowerCase("fr") + message.slice(1) : message;
}

/**
 * What the « Annuler » dialog says once a sample is cancelled « Non reçu »:
 * « Client prévenu par e-mail » only when the e-mail left. A simulated send
 * (no provider configured — HANDOFF §6) is written to the journal of sends
 * and never leaves the laboratory, and nothing sends it later: the client
 * is NOT told, so the réceptionniste is asked to call, as for a failure or
 * a client without an address. `ok` false asks for the warning's colour.
 */
export function notReceivedNoticeText(notice: { status: string; error?: string | null }): { ok: boolean; text: string } {
  switch (notice.status) {
    case "ENVOYE":
      return { ok: true, text: "Client prévenu par e-mail." };
    case "SIMULE":
      return {
        ok: false,
        text: "Envoi simulé : aucun service d'envoi n'est configuré, l'e-mail est inscrit au journal des envois mais n'a pas quitté le laboratoire. Prévenez le client par téléphone.",
      };
    case "NON_ENVOYE":
      return { ok: false, text: `Client non prévenu : ${lowerFirst(notice.error || NO_ADDRESS_MESSAGE)} Prévenez-le par téléphone.` };
    default:
      return { ok: false, text: "Client non prévenu : l'envoi de l'e-mail a échoué. Prévenez-le par téléphone." };
  }
}
