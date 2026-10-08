import type { SampleStatus } from "@/generated/prisma/enums";
import {
  invoiceListHref,
  type ListFilters,
  type ListGroupFilter,
} from "@/components/invoices/invoice-view";
import { VIEW_PARAM } from "./dashboard-view";
import type { EilStatusValue } from "./quality-validation";

/**
 * The views (« comme un tri », `lib/dashboard-view.ts`) of the management
 * dashboards — direction, qualité, magasin, fiche client: which rows a tile
 * opens, kept here so the tile's count and the list it opens read the same
 * rule. Pure and client-safe.
 */

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

/** The number of samples in the given statuses, from a `groupBy(status)`. */
export function countInStatuses(
  counts: ReadonlyMap<SampleStatus, number>,
  statuses: readonly SampleStatus[]
): number {
  return statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Facturation
// ---------------------------------------------------------------------------

/** The anchor of the invoice list, under its figures (`FacturesList`). */
export const INVOICE_LIST_ANCHOR = "liste";

/**
 * The link of an invoice figure: the list filtered to the documents it is
 * made of, scrolled to the list —
 * `invoiceTileHref("/comptabilite/factures", { state: "A_REGLER" })` →
 * `/comptabilite/factures?etat=A_REGLER#liste`.
 */
export function invoiceTileHref(base: string, filters: Partial<ListFilters> = {}): string {
  return `${invoiceListHref(base, filters)}#${INVOICE_LIST_ANCHOR}`;
}

// ---------------------------------------------------------------------------
// Qualité — essais interlaboratoires
// ---------------------------------------------------------------------------

/** « Campagnes EIL ouvertes »: every campaign not yet closed. */
export const EIL_OPEN_STATUSES = [
  "PREVUE",
  "EN_COURS",
  "RESULTATS_RECUS",
] as const satisfies readonly EilStatusValue[];

/** The views of /qualite/eil. */
export const EIL_VIEWS = { ouvertes: "Campagnes ouvertes" } as const;
export type EilView = keyof typeof EIL_VIEWS;

/** The statuses a view of /qualite/eil keeps, or null for every campaign. */
export function eilViewStatuses(view: EilView | null): readonly EilStatusValue[] | null {
  return view === "ouvertes" ? EIL_OPEN_STATUSES : null;
}

/**
 * The rows a status filter keeps (null = all). Applied when rendering, so a
 * list that reloads its rows unfiltered from its API stays filtered.
 */
export function withStatuses<T extends { status: string }>(
  rows: readonly T[],
  statuses: readonly T["status"][] | null
): T[] {
  return statuses ? rows.filter((row) => statuses.includes(row.status)) : [...rows];
}

// ---------------------------------------------------------------------------
// Magasin — factures fournisseurs
// ---------------------------------------------------------------------------

/** The views of /magasin/factures: « Factures à payer » and « Montant à payer » open `a_payer`. */
export const PURCHASE_INVOICE_VIEWS = { a_payer: "À payer" } as const;
export type PurchaseInvoiceView = keyof typeof PURCHASE_INVOICE_VIEWS;

/** The supplier-invoice status a view keeps, or null for every invoice. */
export function purchaseInvoiceViewStatus(view: PurchaseInvoiceView | null): "A_PAYER" | null {
  return view === "a_payer" ? "A_PAYER" : null;
}

// ---------------------------------------------------------------------------
// Fiche client — la carte « Factures »
// ---------------------------------------------------------------------------

/**
 * The views of the fiche's « Factures » card, named after the tile that
 * opens them. The gestionnaire has no invoice list (it lives in the
 * comptabilité and admin spaces), so the fiche filters its own card.
 */
export const CLIENT_INVOICE_VIEWS = { facture: "Facturé", encaisse: "Encaissé" } as const;
export type ClientInvoiceView = keyof typeof CLIENT_INVOICE_VIEWS;

/**
 * The invoice-list group each view is (`invoice-view.ts`): « Facturé » is
 * made of the issued, non-cancelled invoices and credit notes; « Encaissé »
 * of the invoices that received a settlement.
 */
export const CLIENT_INVOICE_VIEW_FILTERS: Record<ClientInvoiceView, ListGroupFilter> = {
  facture: "EMISES",
  encaisse: "AVEC_REGLEMENT",
};

/** The anchor of the fiche's « Factures » card. */
export const CLIENT_INVOICES_ANCHOR = "factures";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The fiche link of a view of its « Factures » card (null = every
 * invoice), keeping the period the fiche's summary is on (`du`, `au`):
 * `clientFicheHref("c1", "facture", { du: "2026-10-01" })` →
 * `/commercial/c1?du=2026-10-01&vue=facture#factures`.
 */
export function clientFicheHref(
  clientId: string,
  view: ClientInvoiceView | null,
  period: { du?: unknown; au?: unknown } = {}
): string {
  const params = new URLSearchParams();
  for (const key of ["du", "au"] as const) {
    const value = period[key];
    if (typeof value === "string" && ISO_DAY.test(value)) params.set(key, value);
  }
  if (view) params.set(VIEW_PARAM, view);
  const query = params.toString();
  return `/commercial/${encodeURIComponent(clientId)}${query ? `?${query}` : ""}#${CLIENT_INVOICES_ANCHOR}`;
}
