/**
 * What the client fiche says about merging, attaching as a site and billing
 * clients (CLIENTS-FUSION.md §2–6) — pure, so the sentences the laboratory
 * reads before an irreversible action are tested. The decisions themselves
 * (allowed or not) belong to `src/lib/client-merge-rules.ts` on the server.
 */

/** The counts `POST /api/clients/[id]/merge` returns (preview and commit). */
export type MergeCounts = {
  series: number;
  samples: number;
  invoices: number;
  sites: number;
  sitesMerged: number;
  emails: number;
  /** Addresses A already had, deleted on B. */
  emailsDeleted?: number;
  places: number;
  placesMerged?: number;
  products: number;
  productsMerged?: number;
  productTypes: number;
  profiles: number;
  /** Optional extras: the links that pointed at B and now point at A. */
  billingClients?: number;
  billedSites?: number;
};

/** The counts `POST /api/clients/[id]/attach-as-site` returns. */
export type AttachCounts = {
  series: number;
  samples: number;
  emails: number;
  places: number;
  products: number;
  productTypes: number;
  profiles: number;
  invoicesKept: number;
};

export type TransferSummary = {
  /** The sentence that says what moves to the kept fiche. */
  headline: string;
  /** The rest of what moves, one line each. */
  details: string[];
  /** What stays on the archived fiche. */
  stays: string[];
};

const q = (name: string) => `« ${name} »`;

/** « 1 série », « 3 séries », « 0 série ». */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

/** « a », « a et b », « a, b et c ». */
export function frenchList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** The memory and settings lines common to both operations, non-zero only. */
function memoryDetails(counts: {
  emails?: number;
  places?: number;
  products?: number;
  productTypes?: number;
  profiles?: number;
}): string[] {
  const details: string[] = [];
  if (n(counts.emails) > 0) details.push(countLabel(n(counts.emails), "adresse e-mail", "adresses e-mail"));
  const memory = [
    n(counts.places) > 0 ? countLabel(n(counts.places), "lieu mémorisé", "lieux mémorisés") : "",
    n(counts.products) > 0 ? countLabel(n(counts.products), "produit mémorisé", "produits mémorisés") : "",
  ].filter(Boolean);
  if (memory.length > 0) details.push(frenchList(memory));
  const settings = [
    n(counts.productTypes) > 0 ? countLabel(n(counts.productTypes), "type de produit", "types de produits") : "",
    n(counts.profiles) > 0 ? countLabel(n(counts.profiles), "profil d'analyse", "profils d'analyse") : "",
  ].filter(Boolean);
  if (settings.length > 0) details.push(frenchList(settings));
  return details;
}

/**
 * « 12 échantillons, 3 séries et 1 facture passeront à « A ». » — the
 * preview of « Fusionner avec… » in plain French.
 */
export function mergeSummary(counts: Partial<MergeCounts>, sourceName: string, targetName: string): TransferSummary {
  const main = [
    n(counts.samples) > 0 ? countLabel(n(counts.samples), "échantillon", "échantillons") : "",
    n(counts.series) > 0 ? countLabel(n(counts.series), "série", "séries") : "",
    n(counts.invoices) > 0 ? countLabel(n(counts.invoices), "facture", "factures") : "",
  ].filter(Boolean);
  const headline =
    main.length > 0
      ? `${frenchList(main)} ${main.length > 1 || n(counts.samples) + n(counts.series) + n(counts.invoices) > 1 ? "passeront" : "passera"} à ${q(targetName)}.`
      : `Aucun échantillon, aucune série ni facture à transférer à ${q(targetName)}.`;

  const details: string[] = [];
  const sites = [
    n(counts.sites) > 0 ? `${countLabel(n(counts.sites), "site déplacé", "sites déplacés")}` : "",
    n(counts.sitesMerged) > 0
      ? `${countLabel(n(counts.sitesMerged), "site fusionné", "sites fusionnés")} avec le site du même nom`
      : "",
  ].filter(Boolean);
  if (sites.length > 0) details.push(frenchList(sites));
  details.push(...memoryDetails(counts));
  if (n(counts.emailsDeleted) > 0) {
    details.push(
      `${countLabel(n(counts.emailsDeleted), "adresse e-mail", "adresses e-mail")} déjà ${n(counts.emailsDeleted) > 1 ? "connues" : "connue"} de ${q(targetName)} : ${n(counts.emailsDeleted) > 1 ? "supprimées" : "supprimée"} sur ${q(sourceName)}`
    );
  }
  if (n(counts.billingClients) > 0) {
    details.push(
      n(counts.billingClients) > 1
        ? `${n(counts.billingClients)} clients facturés de ${q(sourceName)} deviennent clients facturés de ${q(targetName)}`
        : `1 client facturé de ${q(sourceName)} devient client facturé de ${q(targetName)}`
    );
  }
  if (n(counts.billedSites) > 0) {
    details.push(
      `${countLabel(n(counts.billedSites), "site facturé", "sites facturés")} à ${q(sourceName)} le ${n(counts.billedSites) > 1 ? "seront" : "sera"} à ${q(targetName)}`
    );
  }

  return {
    headline,
    details,
    stays: [`La fiche ${q(sourceName)} sera archivée et renverra vers ${q(targetName)}.`],
  };
}

/**
 * « 12 échantillons et 3 séries passeront sur le site « S » de « A ». » —
 * the preview of « Rattacher comme site de… ». The invoices stay with B.
 */
export function attachSummary(
  counts: Partial<AttachCounts>,
  sourceName: string,
  parentName: string,
  site: { name: string; created: boolean }
): TransferSummary {
  const main = [
    n(counts.samples) > 0 ? countLabel(n(counts.samples), "échantillon", "échantillons") : "",
    n(counts.series) > 0 ? countLabel(n(counts.series), "série", "séries") : "",
  ].filter(Boolean);
  const where = `le site ${q(site.name)} de ${q(parentName)}`;
  const headline =
    main.length > 0
      ? `${frenchList(main)} ${n(counts.samples) + n(counts.series) > 1 ? "passeront" : "passera"} sur ${where}.`
      : `Aucun échantillon ni série à transférer sur ${where}.`;

  const details: string[] = [
    site.created
      ? `Le site ${q(site.name)} sera créé chez ${q(parentName)}.`
      : `Le site ${q(site.name)} existe déjà chez ${q(parentName)} : il sera utilisé.`,
  ];
  const memory = memoryDetails(counts);
  details.push(...memory);
  if (n(counts.emails) > 0) {
    details.push("Les adresses e-mail rejoignent le site avec les cases « rapports » et « alertes » décochées.");
  }

  const stays: string[] = [];
  if (n(counts.invoicesKept) > 0) {
    stays.push(
      `${countLabel(n(counts.invoicesKept), "facture reste", "factures restent")} au nom de ${q(sourceName)} : ce sont des documents émis à son nom.`
    );
  }
  stays.push(`La fiche ${q(sourceName)} sera archivée et renverra vers ${q(parentName)}.`);
  return { headline, details, stays };
}

/**
 * Which banner an archived fiche with `mergedIntoId` shows (§6), from the
 * latest CLIENT_MERGED / CLIENT_ATTACHED_AS_SITE journal entry about it.
 * No such entry: the fiche was attached by the import of the sites
 * (RETOUR-LABO-06-10.md §5), which journals CLIENT_ARCHIVED.
 */
export function archivedKind(lastAction: string | null | undefined): "merged" | "attached" {
  return lastAction === "CLIENT_MERGED" ? "merged" : "attached";
}

/**
 * The parent named by the journal entry of a client archived by the import
 * of the sites (`CLIENT_ARCHIVED`, `source: "import"`) — those archived on
 * 07/10, before `mergedIntoId` existed, still say « Rattachée comme site
 * de ». Null for any other entry, or metadata that is not JSON.
 */
export function importedParentId(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const data = JSON.parse(metadata) as { source?: unknown; parentId?: unknown } | null;
    return data && data.source === "import" && typeof data.parentId === "string" && data.parentId ? data.parentId : null;
  } catch {
    return null;
  }
}

/** The banner of an archived fiche that was merged or attached (§6). */
export function archivedBanner(kind: "merged" | "attached", targetName: string): { lead: string; name: string } {
  return {
    lead: kind === "attached" ? "Rattachée comme site de" : "Fusionnée dans",
    name: targetName,
  };
}

/** One choice of the « Facturé à » select of a site. */
export type BillingOption = { value: string; label: string };

/**
 * « Facturé à » for one site: the client itself (value "") then its billing
 * clients. A current billing client no longer in the list (archived, link
 * removed) stays visible so the select never lies about the stored value.
 */
export function siteBillingOptions(
  clientName: string,
  billingClients: { id: string; name: string }[],
  current: { id: string; name: string } | null
): BillingOption[] {
  const options: BillingOption[] = [{ value: "", label: `${clientName} (le client du site)` }];
  for (const billing of billingClients) options.push({ value: billing.id, label: billing.name });
  if (current && !billingClients.some((billing) => billing.id === current.id)) {
    options.push({ value: current.id, label: `${current.name} (lien retiré)` });
  }
  return options;
}

/**
 * The provenance of a sample offered on another client's invoice (§4): a
 * billing client is billed for the samples of its principal's sites.
 * Accepts the explicit `via` the billable route may send, or the sample's own
 * client and site. Null when the sample is the invoice client's own.
 */
export type SampleProvenance = {
  via?: { siteName?: string | null; clientId?: string | null; clientName?: string | null } | null;
  clientId?: string | null;
  client?: { id?: string | null; name?: string | null } | null;
  site?: { name?: string | null } | null;
  siteName?: string | null;
  serie?: { site?: { name?: string | null } | null } | null;
};

export function viaSiteLabel(sample: SampleProvenance, invoiceClientId: string): string | null {
  if (sample.via) {
    const { siteName, clientName, clientId } = sample.via;
    if (clientId && clientId === invoiceClientId) return null;
    if (siteName && clientName) return `via le site ${siteName} de ${clientName}`;
    if (siteName) return `via le site ${siteName}`;
    if (clientName) return `via ${clientName}`;
    return null;
  }
  const ownerId = sample.clientId ?? sample.client?.id ?? null;
  if (!ownerId || ownerId === invoiceClientId) return null;
  const siteName = sample.siteName ?? sample.site?.name ?? sample.serie?.site?.name ?? null;
  const clientName = sample.client?.name ?? null;
  if (siteName && clientName) return `via le site ${siteName} de ${clientName}`;
  if (siteName) return `via le site ${siteName}`;
  if (clientName) return `via ${clientName}`;
  return null;
}

/** When the near-duplicate check runs while typing (§5): from 4 characters. */
export const SIMILAR_MIN_LENGTH = 4;
export const SIMILAR_DEBOUNCE_MS = 400;

export function shouldCheckSimilar(name: string, initialName: string | null, ice: string, initialIce: string | null): boolean {
  const trimmed = name.trim();
  if (trimmed.length < SIMILAR_MIN_LENGTH) return false;
  // Creating: always. Editing: once the name or the ICE changes.
  if (initialName === null) return true;
  return trimmed !== initialName.trim() || ice.trim() !== (initialIce ?? "").trim();
}

/** The query string of `GET /api/clients/similar`. */
export function similarQuery(name: string, ice: string, excludeId?: string | null): string {
  const params = new URLSearchParams({ name: name.trim() });
  if (ice.trim()) params.set("ice", ice.trim());
  if (excludeId) params.set("excludeId", excludeId);
  return params.toString();
}
