import { normalIce } from "./client-identity";

/**
 * Duplicate clients, sites recorded as clients and billing clients
 * (CLIENTS-FUSION.md §2–4) — the decisions, pure. The routes load the
 * records, ask these functions whether the operation is allowed and what to
 * warn about, then write.
 *
 *   checkMerge          « Fusionner avec… »: B (source) disappears into A;
 *   checkAttachAsSite   « Rattacher comme site de… »: B becomes a site of A;
 *   checkBilledFor      « client facturé de »: F receives the invoices of P;
 *   checkSiteBilling    « Facturé à » of one site.
 *
 * Every message is shown as is on the screen.
 */

/** What the rules need to know about a client. */
export type ClientFacts = {
  id: string;
  name: string;
  archived: boolean;
  ice: string | null;
  /** The principal client this one is a billing client of. */
  billedForId: string | null;
  /** Its own sites. */
  sites: number;
  /** The clients billed for it (their `billedForId` is this client). */
  billingClients: number;
  /** The sites (of its principal client) billed to it. */
  billedSites: number;
  /** Its invoices (attach as site: they stay with it). */
  invoices?: number;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type RuleResult = { ok: true; warnings: string[] } | { ok: false; error: string };

/** checkMerge also says which principal client A must be billed for afterwards. */
export type MergeResult =
  | {
      ok: true;
      warnings: string[];
      /**
       * B was a billing client and A was not: A takes B's link (same
       * company), so the sites billed to B, repointed to A, stay billed to a
       * billing client of their client. Null: A's link is left as it is.
       */
      adoptBilledForId: string | null;
    }
  | { ok: false; error: string };

/** checkSiteBilling also gives the value to store (null: the site's client). */
export type SiteBillingResult = { ok: true; warnings: string[]; billingClientId: string | null } | { ok: false; error: string };

const q = (name: string) => `« ${name} »`;
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

const FILLABLE = [
  ["contact", "contact"],
  ["email", "adresse e-mail"],
  ["phone", "téléphone"],
  ["address", "adresse"],
  ["ice", "ICE"],
] as const;

export type FillableField = (typeof FILLABLE)[number][0];

const filled = (value: string | null | undefined) => (value ?? "").trim() !== "";

/**
 * The empty fields of A that B completes, and B's fields ignored because A
 * already has a value of its own (nothing is overwritten). A value equal on
 * both sides (case and spaces ignored) is not reported as ignored.
 */
export function mergeFill(
  source: Pick<ClientFacts, FillableField>,
  target: Pick<ClientFacts, FillableField>
): { fill: Partial<Record<FillableField, string>>; ignored: FillableField[] } {
  const fill: Partial<Record<FillableField, string>> = {};
  const ignored: FillableField[] = [];
  for (const [field] of FILLABLE) {
    const from = source[field];
    const to = target[field];
    if (!filled(from)) continue;
    if (!filled(to)) {
      fill[field] = from!.trim();
      continue;
    }
    const same =
      field === "ice" ? normalIce(from) === normalIce(to) : from!.trim().replace(/\s+/g, " ").toLowerCase() === to!.trim().replace(/\s+/g, " ").toLowerCase();
    if (!same) ignored.push(field);
  }
  return { fill, ignored };
}

const fieldWords = (fields: readonly FillableField[]) =>
  fields.map((field) => FILLABLE.find(([key]) => key === field)![1]).join(", ");

/** Refusals shared by every operation on two clients. */
function twoClients(source: ClientFacts, target: ClientFacts, same: string): string | null {
  if (source.id === target.id) return same;
  if (source.archived) return `${q(source.name)} est archivé : réactivez-le d'abord.`;
  if (target.archived) return `${q(target.name)} est archivé : choisissez un client actif.`;
  return null;
}

/**
 * « Fusionner avec… » — `source` (B) disappears into `target` (A)
 * (CLIENTS-FUSION.md §2).
 */
export function checkMerge(source: ClientFacts, target: ClientFacts): MergeResult {
  const refused = twoClients(source, target, "Choisissez une autre fiche : un client ne se fusionne pas avec lui-même.");
  if (refused) return { ok: false, error: refused };

  const sourceIce = normalIce(source.ice);
  const targetIce = normalIce(target.ice);
  if (sourceIce && targetIce && sourceIce !== targetIce) {
    return {
      ok: false,
      error: `${q(source.name)} et ${q(target.name)} ont deux ICE différents : ce sont deux sociétés. Liez-les comme client facturé si l'une paie pour l'autre.`,
    };
  }
  if (target.billedForId === source.id) {
    return { ok: false, error: `${q(target.name)} est client facturé de ${q(source.name)} : retirez ce lien d'abord.` };
  }
  if (source.billedForId === target.id) {
    return { ok: false, error: `${q(source.name)} est client facturé de ${q(target.name)} : retirez ce lien d'abord.` };
  }
  // The links that targeted B target A afterwards: they must stay valid.
  if (source.billingClients > 0 && target.billedForId) {
    return {
      ok: false,
      error: `${q(source.name)} a des clients facturés et ${q(target.name)} est lui-même client facturé d'un autre client : retirez un des liens d'abord.`,
    };
  }
  if (source.billedForId && target.billedForId && source.billedForId !== target.billedForId) {
    return {
      ok: false,
      error: `${q(source.name)} et ${q(target.name)} sont clients facturés de deux clients différents : retirez un des liens d'abord.`,
    };
  }
  let adoptBilledForId: string | null = null;
  if (source.billedForId && !target.billedForId) {
    if (target.billingClients > 0) {
      return {
        ok: false,
        error: `${q(source.name)} est client facturé d'un autre client et ${q(target.name)} a ses propres clients facturés : retirez un des liens d'abord.`,
      };
    }
    adoptBilledForId = source.billedForId;
  }

  const warnings: string[] = [];
  if (!sourceIce && !targetIce) {
    warnings.push("Aucune des deux fiches n'a d'ICE : vérifiez qu'il s'agit bien de la même société.");
  } else if (!sourceIce) {
    warnings.push(`${q(source.name)} n'a pas d'ICE : vérifiez qu'il s'agit bien de la même société que ${q(target.name)}.`);
  } else if (!targetIce) {
    warnings.push(`${q(target.name)} n'a pas d'ICE : il reprendra celui de ${q(source.name)}.`);
  }
  const { ignored } = mergeFill(source, target);
  if (ignored.length > 0) {
    warnings.push(`Déjà renseignés sur ${q(target.name)}, ces champs de ${q(source.name)} sont ignorés : ${fieldWords(ignored)}.`);
  }
  if (adoptBilledForId) {
    warnings.push(`${q(target.name)} devient client facturé du même client que ${q(source.name)}.`);
  }
  return { ok: true, warnings, adoptBilledForId };
}

/**
 * « Rattacher comme site de… » — `source` (B) becomes a site of `parent` (A)
 * (CLIENTS-FUSION.md §3). `existingSite`: the site of A chosen to receive B.
 */
export function checkAttachAsSite(
  source: ClientFacts,
  parent: ClientFacts,
  existingSite?: { id: string; clientId: string; name?: string } | null
): RuleResult {
  const refused = twoClients(source, parent, "Choisissez un autre client : un client ne devient pas son propre site.");
  if (refused) return { ok: false, error: refused };
  if (source.sites > 0) {
    return {
      ok: false,
      error: `${q(source.name)} a ${plural(source.sites, "site", "sites")} : un client qui a des sites ne devient pas un site. Fusionnez-le plutôt.`,
    };
  }
  if (source.billedForId) {
    return { ok: false, error: `${q(source.name)} est client facturé d'un autre client : retirez ce lien d'abord.` };
  }
  if (source.billingClients > 0) {
    return { ok: false, error: `${q(source.name)} a des clients facturés : retirez ces liens d'abord.` };
  }
  if (source.billedSites > 0) {
    return {
      ok: false,
      error: `${plural(source.billedSites, "site est facturé", "sites sont facturés")} à ${q(source.name)} : changez « Facturé à » d'abord.`,
    };
  }
  if (existingSite && existingSite.clientId !== parent.id) {
    return { ok: false, error: `Ce site n'appartient pas à ${q(parent.name)}.` };
  }

  const warnings: string[] = [];
  if (normalIce(source.ice)) {
    warnings.push(`${q(source.name)} a son propre ICE : c'est peut-être un client facturé plutôt qu'un site.`);
  }
  if ((source.invoices ?? 0) > 0) {
    warnings.push(
      `${plural(source.invoices!, "facture reste", "factures restent")} au nom de ${q(source.name)} : ce sont des documents émis à son nom.`
    );
  }
  return { ok: true, warnings };
}

/**
 * « Client facturé de » — `child` (F) receives the invoices for `parent` (P);
 * `parent` null removes the link (CLIENTS-FUSION.md §4). When F stops being a
 * billing client of the principal its sites are billed to, those sites go
 * back to their own client: the route clears their `billingClientId`
 * (warned here).
 */
export function checkBilledFor(child: ClientFacts, parent: ClientFacts | null): RuleResult {
  const warnings: string[] = [];
  const leaving = child.billedForId !== null && child.billedForId !== (parent?.id ?? null);
  if (leaving && child.billedSites > 0) {
    warnings.push(
      `${plural(child.billedSites, "site facturé", "sites facturés")} à ${q(child.name)} ${child.billedSites > 1 ? "reviendront" : "reviendra"} au client du site.`
    );
  }
  if (parent === null) return { ok: true, warnings };

  if (child.id === parent.id) return { ok: false, error: "Un client ne peut pas être son propre client facturé." };
  if (child.archived) return { ok: false, error: `${q(child.name)} est archivé : réactivez-le d'abord.` };
  if (parent.archived) return { ok: false, error: `${q(parent.name)} est archivé : choisissez un client actif.` };
  if (parent.billedForId) {
    return { ok: false, error: `${q(parent.name)} est lui-même client facturé d'un autre client : choisissez le client principal.` };
  }
  if (child.billingClients > 0) {
    return {
      ok: false,
      error: `${q(child.name)} a ${plural(child.billingClients, "client facturé", "clients facturés")} : retirez ces liens d'abord.`,
    };
  }
  return { ok: true, warnings };
}

/**
 * « Facturé à » of a site: null (the site's client) or a billing client of
 * the site's client (CLIENTS-FUSION.md §4). The site's own client chosen
 * explicitly is stored as null.
 */
export function checkSiteBilling(
  site: { id: string; clientId: string; name?: string },
  billingClient: Pick<ClientFacts, "id" | "name" | "archived" | "billedForId"> | null
): SiteBillingResult {
  if (billingClient === null || billingClient.id === site.clientId) return { ok: true, warnings: [], billingClientId: null };
  if (billingClient.archived) return { ok: false, error: `${q(billingClient.name)} est archivé : choisissez un client actif.` };
  if (billingClient.billedForId !== site.clientId) {
    return {
      ok: false,
      error: `${q(billingClient.name)} n'est pas un client facturé de ce client : liez-le d'abord depuis la fiche du client.`,
    };
  }
  return { ok: true, warnings: [], billingClientId: billingClient.id };
}

/**
 * The client a sample is invoiced to (CLIENTS-FUSION.md §4): the billing
 * client of its série's site when the site has one, else its own client.
 * The billable list of a client and the creation of an invoice both follow
 * it, so a sample is offered to exactly one client.
 */
export function sampleBillingClientId(sample: { clientId: string; siteBillingClientId?: string | null }): string {
  return sample.siteBillingClientId || sample.clientId;
}

/**
 * May this sample be a line of an invoice for `invoiceClientId`? Null when
 * it may; otherwise the refusal shown as is. `siteBillingClientName`: the
 * name of the site's billing client, for the message.
 */
export function invoiceSampleRefusal(
  sample: { code: string; clientId: string; siteBillingClientId?: string | null; siteBillingClientName?: string | null },
  invoiceClientId: string
): string | null {
  if (sampleBillingClientId(sample) === invoiceClientId) return null;
  if (sample.clientId === invoiceClientId && sample.siteBillingClientId) {
    const to = sample.siteBillingClientName ? q(sample.siteBillingClientName) : "un client facturé";
    return `L'échantillon ${sample.code} est facturé à ${to} : son site lui est attribué (« Facturé à »).`;
  }
  return `L'échantillon ${sample.code} appartient à un autre client.`;
}
