import { normalIce } from "./client-identity";
import { resolveRecipients, type ClientRecipients } from "./email-recipients";

/**
 * « À compléter » (RETOUR-LABO-16-10.md E3, R4 of RETOUR-LABO-14-10.md) —
 * pure, shared by the client base, the client fiche and its form.
 *
 * A client created at the counter or in the field (`Client.toComplete`)
 * often has its name alone. What the gestionnaire commercial still owes it
 * is what the documents and the sending need: the ICE (on every invoice),
 * an address that receives the reports, and the postal address (on the
 * report). The flag is cleared when the gestionnaire or the administrator
 * saves the whole fiche — never by an archiving alone.
 */

/** What a client may still lack, in the order the hint names them. */
export type CompletionGap = "ice" | "reportAddress" | "address";

export const COMPLETION_GAP_LABELS: Record<CompletionGap, string> = {
  ice: "ICE",
  reportAddress: "adresse e-mail des rapports",
  address: "adresse postale",
};

/** The client as the gaps read it: its ICE, its postal address and its recipients. */
export type CompletionFacts = ClientRecipients & { ice: string | null; address: string | null };

/**
 * What the client still lacks. « Adresse des rapports »: nobody would
 * receive a report about the siège (`resolveRecipients`) — no address, or
 * only addresses of its sites. An ICE made of zeros is no ICE (`normalIce`).
 */
export function clientCompletionGaps(client: CompletionFacts): CompletionGap[] {
  const gaps: CompletionGap[] = [];
  if (!normalIce(client.ice)) gaps.push("ice");
  if (resolveRecipients(client, "reports", null).to.length === 0) gaps.push("reportAddress");
  if (!(client.address ?? "").trim()) gaps.push("address");
  return gaps;
}

/** « ICE, adresse e-mail des rapports et adresse postale ». */
function gapList(gaps: readonly CompletionGap[]): string {
  const words = gaps.map((gap) => COMPLETION_GAP_LABELS[gap]);
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} et ${words[words.length - 1]}`;
}

/**
 * The sentence under « À compléter » (badge tooltip, fiche, form): what is
 * missing, or — nothing missing — that the fiche only waits to be checked
 * and saved.
 */
export function completionHint(gaps: readonly CompletionGap[]): string {
  return gaps.length > 0
    ? `Manque : ${gapList(gaps)}.`
    : "Rien ne manque : vérifiez la fiche, puis enregistrez-la.";
}

/**
 * The flag after a `PATCH /api/clients/[id]`: a save of the whole fiche (the
 * client form) clears it, and says so for the journal (`completed`); an
 * archiving or a reactivation alone leaves it as it was.
 */
export function toCompleteAfterSave(current: boolean, fullSave: boolean): { toComplete: boolean; completed: boolean } {
  return fullSave ? { toComplete: false, completed: current } : { toComplete: current, completed: false };
}

/**
 * Is this client « À compléter » for the client base — flagged and still
 * live? An archived client is no longer anyone's to complete: the toggle's
 * count, its filter and the badge read this one rule.
 */
export function awaitsCompletion(client: { toComplete: boolean; archived: boolean }): boolean {
  return client.toComplete && !client.archived;
}
