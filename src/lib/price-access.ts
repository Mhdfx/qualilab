import { billedAnalysesNotice, heldInvoiceLabel, type HeldInvoice, type InvoiceFact } from "./billing";
import type { Role } from "./roles";

/**
 * Who sees what the laboratory charges — the owner's rule of 24–25/10:
 * the prices of the analyses and services (`LabService.unitPrice`, the
 * programme's priced lines, totals, amounts in DH) and the invoices, credit
 * notes, payments and billing status are for the comptabilité, the
 * administrator, the Direction and the gestionnaire commercial (who keeps
 * reading his clients' invoices and the prices) only.
 *
 * The réception keeps the counter's advance and nothing else: it types the
 * amount and the mode at the deposit, and the bon de réception prints
 * « Avance » — no price of an analysis, no invoice, no billing status.
 * Every other staff role — the responsable des paramètres, the technician,
 * the validateur, the préleveur, the magasinier — sees none of it, on a
 * screen, in a menu, in an API answer, a PDF or an export. The portal
 * (CLIENT) has its own routes and reads its own invoices there.
 *
 * One rule for every surface: a page or route whose guard admits a role
 * outside `BILLING_ROLES` strips the figures from what it loads and answers
 * through these helpers — hiding them on screen is not enough.
 * `price-access-guards.test.ts` reads every page and route against it.
 */

/** The roles that see prices, amounts, invoices and billing status. */
export const BILLING_ROLES = ["COMPTABLE", "ADMIN", "DIRECTION", "GESTIONNAIRE"] as const satisfies readonly Role[];

/** The roles that see the counter's advance (`Serie.advanceAmount` / `advanceMode`): the réception, and the billing roles. */
export const ADVANCE_ROLES = ["RECEPTIONNISTE", ...BILLING_ROLES] as const satisfies readonly Role[];

/** True for a role that sees prices, amounts, invoices and billing status. */
export function seesBilling(role: unknown): boolean {
  return (BILLING_ROLES as readonly unknown[]).includes(role);
}

/** True for a role that sees the advance paid at the counter. */
export function seesAdvance(role: unknown): boolean {
  return (ADVANCE_ROLES as readonly unknown[]).includes(role);
}

/**
 * The invoice holding a sample as this role is told of it: whether it is
 * issued or a draft — the operational warning (« Déjà facturé : la
 * comptabilité établira un avoir ») stays for whoever cancels or changes
 * billed work — and its number for the billing roles only. Never the
 * invoice's id. `issued` is carried apart: a null number alone would read
 * as a draft.
 */
export function heldInvoiceFor(held: Pick<HeldInvoice, "number">, role: unknown): InvoiceFact {
  return { number: seesBilling(role) ? held.number : null, issued: held.number !== null };
}

/**
 * The `billing` part of the answer of a change of analyses on a sample an
 * invoice holds (the programme's PUT, « Corriger les analyses »): the
 * invoice's label (« FAC-… » or « brouillon ») and the notice naming it for
 * the billing roles; the notice without the number for the others.
 */
export function billingAnswer(held: Pick<HeldInvoice, "number">, role: unknown): { invoice?: string; notice: string } {
  const notice = billedAnalysesNotice(heldInvoiceFor(held, role));
  return seesBilling(role) ? { invoice: heldInvoiceLabel(held), notice } : { notice };
}

/** A copy of `value` without `keys`. */
function without<T extends object, K extends string>(value: T, keys: readonly K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(keys as readonly string[]).includes(key))) as Omit<T, K>;
}

/**
 * A client as the API hands it to this role: « client facturé de » (which
 * client pays — `billedFor` / `billedForId`, CLIENTS-FUSION.md §4) for the
 * billing roles only. No screen of the other roles reads it.
 */
export function clientForRole<T extends object>(client: T, role: unknown): Omit<T, "billedFor" | "billedForId"> {
  return seesBilling(role) ? client : without(client, ["billedFor", "billedForId"]);
}

/** A site as the API hands it to this role: « Facturé à » (`billingClient` / `billingClientId`) for the billing roles only. */
export function siteForRole<T extends object>(site: T, role: unknown): Omit<T, "billingClient" | "billingClientId"> {
  return seesBilling(role) ? site : without(site, ["billingClient", "billingClientId"]);
}
