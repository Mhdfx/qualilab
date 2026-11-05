import { formatCurrency, formatDate } from "./labels";
import { roundMoney } from "./invoice-math";

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5, R-4 « Oui ») — the prices proper to
 * some clients.
 *
 * The old software kept ≈ 6 700 of them (PRIX_PARAME_PARCLIENTS): a client
 * pays its own price for an analysis. The laboratory answered on 04/11 that
 * they are taken over and that the invoice proposes the client's price
 * instead of the catalogue's — always editable, the line saying where its
 * price comes from.
 *
 * One price per client and analysis (`AnalysisParameter`, which carries its
 * domain) or service of the catalogue (`LabService`): `clientPriceKey`.
 * Where it comes from: the reprise (« Importer les prix clients »,
 * client-prices-import.ts) or the client's fiche (typed by a role that sees
 * prices — `BILLING_ROLES`, price-access.ts). A price typed by hand is never
 * overwritten by a later reprise.
 *
 * The proposal of an invoice line (`resolveLinePrice`, called by
 * `proposeLines` in billing.ts): the client's price for the analysis, else
 * the client's price for the catalogue service the analysis is billed as,
 * else the catalogue's, else « prix à saisir ». Pure and client-safe.
 */

export type ClientPriceOrigin = "REPRISE" | "SAISIE";

export const CLIENT_PRICE_ORIGIN_LABELS: Record<ClientPriceOrigin, string> = {
  REPRISE: "Repris de l'ancien logiciel",
  SAISIE: "Saisi sur la fiche client",
};

/** What a client price is for: one analysis or one service of the catalogue — exactly one. */
export type ClientPriceTarget = { parameterId: string; labServiceId?: null } | { labServiceId: string; parameterId?: null };

/** « P:<parameterId> » or « S:<labServiceId> » — the column `ClientPrice.itemKey`, unique per client. */
export function clientPriceKey(target: { parameterId?: string | null; labServiceId?: string | null }): string {
  const parameterId = target.parameterId ?? null;
  const labServiceId = target.labServiceId ?? null;
  if ((parameterId === null) === (labServiceId === null)) {
    throw new Error("Un prix client porte sur une analyse ou sur une prestation, et une seule.");
  }
  return parameterId !== null ? `P:${parameterId}` : `S:${labServiceId}`;
}

/** A client price as the invoice proposal reads it. */
export type ClientPriceEntry = {
  parameterId: string | null;
  labServiceId: string | null;
  unitPrice: number;
  origin: ClientPriceOrigin;
  /** ISO date of the last change in this software. */
  updatedAt: string;
};

export type ClientPriceIndex = {
  byParameter: ReadonlyMap<string, ClientPriceEntry>;
  byService: ReadonlyMap<string, ClientPriceEntry>;
};

export const EMPTY_CLIENT_PRICES: ClientPriceIndex = { byParameter: new Map(), byService: new Map() };

export function clientPriceIndex(entries: readonly ClientPriceEntry[]): ClientPriceIndex {
  const byParameter = new Map<string, ClientPriceEntry>();
  const byService = new Map<string, ClientPriceEntry>();
  for (const entry of entries) {
    if (entry.parameterId) byParameter.set(entry.parameterId, entry);
    else if (entry.labServiceId) byService.set(entry.labServiceId, entry);
  }
  return { byParameter, byService };
}

/**
 * Where the price an invoice line proposes comes from — said on the line:
 * the client's own price (with its origin), the catalogue's, or none.
 */
export type LinePriceOrigin =
  | { source: "CLIENT"; origin: ClientPriceOrigin; updatedAt: string; cataloguePrice: number | null }
  | { source: "CATALOGUE" }
  | { source: "NONE" };

export type LinePrice = { unitPrice: number; origin: LinePriceOrigin };

/**
 * The price an invoice line proposes for one analysis of a sample: the
 * client's price for the analysis, else the client's price for the
 * catalogue service it is billed as, else the catalogue's, else nothing
 * (« prix à saisir »).
 */
export function resolveLinePrice(
  prices: ClientPriceIndex,
  parameterId: string | null | undefined,
  catalogue: { id?: string | null; unitPrice: number } | null
): LinePrice {
  const cataloguePrice = catalogue ? roundMoney(catalogue.unitPrice) : null;
  const own =
    (parameterId ? prices.byParameter.get(parameterId) : undefined) ??
    (catalogue?.id ? prices.byService.get(catalogue.id) : undefined);
  if (own) {
    return {
      unitPrice: roundMoney(own.unitPrice),
      origin: { source: "CLIENT", origin: own.origin, updatedAt: own.updatedAt, cataloguePrice },
    };
  }
  if (cataloguePrice !== null) return { unitPrice: cataloguePrice, origin: { source: "CATALOGUE" } };
  return { unitPrice: 0, origin: { source: "NONE" } };
}

/**
 * What the line says of its price, in French: « Prix du client — repris de
 * l'ancien logiciel (catalogue : 320,00 DH) », « Prix du catalogue »,
 * « Prix à saisir ».
 */
export function linePriceOriginLabel(origin: LinePriceOrigin): string {
  if (origin.source === "CATALOGUE") return "Prix du catalogue";
  if (origin.source === "NONE") return "Prix à saisir : ni prix du client ni prix au catalogue";
  const how =
    origin.origin === "REPRISE" ? "repris de l'ancien logiciel" : `saisi sur la fiche client le ${formatDate(origin.updatedAt)}`;
  const catalogue = origin.cataloguePrice !== null ? ` (catalogue : ${formatCurrency(origin.cataloguePrice)})` : "";
  return `Prix du client — ${how}${catalogue}`;
}

/**
 * The price a line carries is the one proposed, or one typed by the
 * accountant over it: then the line says « Prix modifié à la main ».
 */
export function priceEditedByHand(proposed: number | null | undefined, typed: string): boolean {
  if (proposed === null || proposed === undefined) return false;
  const value = Number(typed.replace(",", "."));
  if (!typed.trim() || !Number.isFinite(value)) return proposed !== 0;
  return roundMoney(value) !== roundMoney(proposed);
}

/** The highest price a client price may carry: an invoice line's bound (`checkInvoiceLines`). */
export const CLIENT_PRICE_MAX = 10_000_000;

export type ClientPriceInput = { target: ClientPriceTarget; unitPrice: number };

/**
 * A price typed on the client's fiche: `{ parameterId | labServiceId,
 * unitPrice }`. Above zero — a client who pays the catalogue price has no
 * price of its own (the price is removed, not set to 0) — rounded to the
 * centime, within an invoice line's bound. The French refusal, or the value.
 */
export function parseClientPriceInput(body: unknown): { ok: true; value: ClientPriceInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const raw = body as Record<string, unknown>;
  const parameterId = typeof raw.parameterId === "string" && raw.parameterId.trim() ? raw.parameterId.trim() : null;
  const labServiceId = typeof raw.labServiceId === "string" && raw.labServiceId.trim() ? raw.labServiceId.trim() : null;
  if ((parameterId === null) === (labServiceId === null)) {
    return { ok: false, error: "Choisissez une analyse ou une prestation, et une seule." };
  }
  const price =
    typeof raw.unitPrice === "number"
      ? raw.unitPrice
      : typeof raw.unitPrice === "string" && raw.unitPrice.trim()
        ? Number(raw.unitPrice.trim().replace(/\s/g, "").replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(price)) return { ok: false, error: "Saisissez le prix HT, par exemple 250 ou 249,50." };
  const unitPrice = roundMoney(price);
  if (unitPrice <= 0) {
    return { ok: false, error: "Le prix doit être supérieur à 0 : pour revenir au prix du catalogue, retirez le prix du client." };
  }
  if (unitPrice > CLIENT_PRICE_MAX) return { ok: false, error: "Prix hors limites (10 000 000 DH au plus)." };
  const target: ClientPriceTarget = parameterId !== null ? { parameterId } : { labServiceId: labServiceId! };
  return { ok: true, value: { target, unitPrice } };
}

/** A client price as the fiche lists it (`/api/clients/[id]/prices`). */
export type ClientPriceRow = {
  id: string;
  kind: "ANALYSE" | "PRESTATION";
  parameterId: string | null;
  labServiceId: string | null;
  /** The analysis or the service, as the catalogue names it. */
  label: string;
  /** « Alimentaire », « Eau », « Ambiance » — or the service's category. */
  domain: string;
  unitPrice: number;
  /** The catalogue's price for comparison, or null (no catalogue entry). */
  cataloguePrice: number | null;
  origin: ClientPriceOrigin;
  updatedAt: string;
  /** REPRISE: when the old software last changed it. */
  legacyModifiedAt: string | null;
  /** SAISIE: who typed it. */
  updatedBy: string | null;
};

/** The fiche's list: analyses first, then services, each by label. */
export function sortClientPriceRows<T extends Pick<ClientPriceRow, "kind" | "label" | "domain">>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "ANALYSE" ? -1 : 1) ||
      a.label.localeCompare(b.label, "fr", { sensitivity: "base" }) ||
      a.domain.localeCompare(b.domain, "fr")
  );
}

/** The fiche's filter: every word of the search in the label or the domain, accents and case aside. */
export function matchesClientPriceSearch(row: Pick<ClientPriceRow, "label" | "domain">, search: string): boolean {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const haystack = fold(`${row.label} ${row.domain}`);
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
