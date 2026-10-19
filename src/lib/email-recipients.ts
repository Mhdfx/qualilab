/**
 * Who receives a client's mail — the rule behind `recipientsFor` (email.ts).
 * Pure: the caller reads the client's addresses, this decides.
 *
 * A client's address is client-wide (`siteId` null) or bound to one of its
 * sites (`ClientEmail.siteId`: the import of 07/10, the attachment of a
 * client as a site). A mail about a sample goes to the client-wide addresses
 * and to the addresses of the sample's site — never to another site's
 * (D-04, 16/10): for a chain or a franchise, the manager of one shop must not
 * receive the reports of the others. A mail with no known site (the siège,
 * an older caller) goes to the client-wide addresses only.
 *
 * When no address of the list applies, the single address of the client
 * record (`Client.email`) is used, as before the lists existed — unless it is
 * itself the address of another site (typed into the record, or already on
 * it when that site's client was attached as a site): the same leak by
 * another door.
 */

export type RecipientKind = "reports" | "alerts";

/** One `ClientEmail` row, as the rule reads it. */
export type ClientAddress = {
  email: string;
  siteId: string | null;
  forReports: boolean;
  forAlerts: boolean;
};

/** The client as the rule reads it: its record's address and its whole list, ticked or not. */
export type ClientRecipients = {
  email: string | null;
  emails: readonly ClientAddress[];
};

/** Who a mail goes to — and, when nobody, whether other sites' addresses are the reason. */
export type RecipientPick = {
  to: string[];
  /**
   * Nobody, although the client has addresses for this mail: they all belong
   * to other sites (`otherSitesMessage` tells the user what to fix).
   */
  otherSitesOnly: boolean;
};

const ticked = (address: ClientAddress, kind: RecipientKind) => (kind === "reports" ? address.forReports : address.forAlerts);
const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Does this address take part in a mail of `kind` about the site `siteId`? */
export function addressApplies(address: ClientAddress, kind: RecipientKind, siteId: string | null): boolean {
  return ticked(address, kind) && (address.siteId === null || address.siteId === siteId);
}

/** The addresses a mail of `kind` about the site `siteId` goes to, without duplicates, and why none. */
export function resolveRecipients(client: ClientRecipients, kind: RecipientKind, siteId: string | null = null): RecipientPick {
  const listed = client.emails.filter((address) => addressApplies(address, kind, siteId)).map((a) => a.email);
  if (listed.length > 0) return { to: Array.from(new Set(listed)), otherSitesOnly: false };

  // Ticked or not: an unticked shop address typed into the record is still that shop's.
  const elsewhere = client.emails.filter((address) => address.siteId !== null && address.siteId !== siteId);
  const record = client.email?.trim() ?? "";
  if (record && !elsewhere.some((address) => sameAddress(address.email, record))) {
    return { to: [record], otherSitesOnly: false };
  }
  return { to: [], otherSitesOnly: record !== "" || elsewhere.some((address) => ticked(address, kind)) };
}

/** The addresses a mail of `kind` about the site `siteId` goes to, without duplicates. */
export function pickRecipients(client: ClientRecipients, kind: RecipientKind, siteId: string | null = null): string[] {
  return resolveRecipients(client, kind, siteId).to;
}

/**
 * The refusal when nobody receives a mail because every address belongs to
 * another site — « Aucune adresse enregistrée » would be false: the
 * gestionnaire sees ticked addresses on the fiche and cannot find the cause.
 */
export function otherSitesMessage(kind: RecipientKind, siteId: string | null): string {
  const what = kind === "alerts" ? "adresse d'alerte" : "adresse email";
  return siteId
    ? `Aucune ${what} pour ce site ni pour l'ensemble du client : les adresses enregistrées appartiennent à d'autres sites. Ajoutez une adresse générale sur la fiche client.`
    : `Aucune ${what} pour l'ensemble du client : les adresses enregistrées appartiennent à ses sites et ne reçoivent que leurs envois. Ajoutez une adresse générale sur la fiche client.`;
}

/**
 * What the client form says under a site's address (D-04), from the boxes
 * « Reçoit les rapports » / « Reçoit les alertes » beneath it: the sites
 * import and the attachment as a site leave both unticked. The server keeps
 * the site of an address saved unchanged (it matches by address, any case):
 * an address retyped loses its site and becomes the whole client's.
 */
export function siteAddressHint(
  siteName: string,
  savedEmail: string,
  currentEmail: string,
  boxes: { forReports: boolean; forAlerts: boolean }
): { kept: boolean; text: string } {
  const kept = sameAddress(currentEmail, savedEmail);
  if (!kept) {
    return {
      kept,
      text: `(site ${siteName}) — adresse modifiée : elle ne sera plus rattachée à ce site et, cochée, recevra les envois de tous les sites.`,
    };
  }
  const receives = [boxes.forReports && "les rapports", boxes.forAlerts && "les alertes"].filter(Boolean).join(" et ");
  return {
    kept,
    text: receives
      ? `(site ${siteName}) — reçoit ${receives} de ce site seulement.`
      : `(site ${siteName}) — adresse de ce site seulement ; aucune case cochée, elle ne reçoit rien.`,
  };
}
