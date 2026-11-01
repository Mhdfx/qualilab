import type { PaymentMode } from "@/generated/prisma/enums";
import { PAYMENT_MODE_LABELS, RECORDABLE_PAYMENT_MODES } from "./invoice-lifecycle";
import { netToPay, type CertificateState } from "./withholding";
import { PAYMENT_REQUIRES_TAX_CERTIFICATE } from "./lab-proposals";
import type { DueState } from "./stock";

/**
 * Where a supplier invoice stands (lot 3D, RETOUR-LABO-28-10.md M1, M6) —
 * pure, shared by the routes, the screens and the purchase journal.
 *
 * - Its amounts: TTC (`amount`, the base every screen reads), and since lot
 *   3D HT and TVA; the retenue à la source (M7) leaves a net à payer.
 * - Its payments: one or several (partial payments, hypothèse R-23, switch
 *   `PURCHASE_PARTIAL_PAYMENTS`); the invoice is PAYEE once they reach the
 *   net à payer. An invoice marked paid before lot 3D has no payment row:
 *   it reads as paid in full on its `paidAt`.
 * - « Statut » of the journal (hypothèse R-23): « Payée », « Partiellement
 *   payée », « À payer », « En retard », « Annulée ».
 * - Only an invoice still to pay, with no payment, can be corrected or
 *   cancelled (« Annuler la saisie »): what has been paid is history.
 */

export type PurchaseStatus = "A_PAYER" | "PAYEE" | "ANNULEE";

export const PURCHASE_PAYMENT_METHODS: readonly PaymentMode[] = RECORDABLE_PAYMENT_MODES;
export const PURCHASE_PAYMENT_METHOD_LABELS = PAYMENT_MODE_LABELS;

const cents = (value: number) => Math.round(value * 100);

/** The sum of the payments, to the centime. */
export function paidTotal(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + cents(amount), 0) / 100;
}

export type PurchaseFigures = {
  status: PurchaseStatus;
  /** TTC. */
  amount: number;
  withholdingAmount: number | null;
  /** Each recorded payment's amount. */
  payments: number[];
};

/** Net à payer, paid so far and what is left (0 for a paid or cancelled invoice). */
export function purchaseBalance(invoice: PurchaseFigures): { net: number; paid: number; remaining: number } {
  const net = netToPay(invoice.amount, invoice.withholdingAmount);
  if (invoice.status === "ANNULEE") return { net, paid: 0, remaining: 0 };
  // Paid before lot 3D: no payment row, paid in full.
  const paid = invoice.status === "PAYEE" && invoice.payments.length === 0 ? net : paidTotal(invoice.payments);
  const remaining = invoice.status === "PAYEE" ? 0 : Math.max(0, cents(net) - cents(paid)) / 100;
  return { net, paid, remaining };
}

export type PurchaseStatusLabel = "Payée" | "Partiellement payée" | "À payer" | "En retard" | "Annulée";

/** The « Statut » the list and the journal print. */
export function purchaseStatusLabel(invoice: PurchaseFigures, due: DueState): PurchaseStatusLabel {
  if (invoice.status === "ANNULEE") return "Annulée";
  if (invoice.status === "PAYEE") return "Payée";
  if (invoice.payments.length > 0 && paidTotal(invoice.payments) > 0) return "Partiellement payée";
  return due === "RETARD" ? "En retard" : "À payer";
}

/** Correction and « Annuler la saisie »: only an invoice still to pay that holds no payment. */
export function isCorrectable(invoice: { status: PurchaseStatus; paymentCount: number }): boolean {
  return invoice.status === "A_PAYER" && invoice.paymentCount === 0;
}

/** Why an invoice cannot be corrected or cancelled, in French; null when it can. */
export function correctionRefusal(invoice: { status: PurchaseStatus; paymentCount: number }): string | null {
  if (invoice.status === "ANNULEE") return "Cette facture a été annulée.";
  if (invoice.status === "PAYEE" || invoice.paymentCount > 0) {
    return "Une facture déjà payée (même en partie) ne se corrige pas : annulez d'abord ses paiements.";
  }
  return null;
}

/**
 * Whether a new payment of `amount` is acceptable against what is left:
 * positive, not beyond the remaining amount, and — partial payments off —
 * exactly the remaining amount. Null when it is; the French refusal else.
 */
export function paymentAmountError(amount: number, remaining: number, partialAllowed: boolean): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Le montant payé doit être un nombre positif.";
  if (remaining <= 0) return "Cette facture est déjà réglée.";
  if (cents(amount) > cents(remaining)) {
    return `Le montant payé dépasse le reste à payer (${remaining.toFixed(2).replace(".", ",")} DH).`;
  }
  if (!partialAllowed && cents(amount) !== cents(remaining)) {
    return "Le paiement doit régler tout le reste à payer.";
  }
  return null;
}

/**
 * The switch `PAYMENT_REQUIRES_TAX_CERTIFICATE` (M7, hypothèse R-24): on,
 * the payment of an invoice that no valid attestation covers is refused;
 * off (the plan's proposal), it is only warned about. Null when the
 * payment may go on; the French refusal else.
 */
export function paymentCertificateRefusal(
  certificate: CertificateState,
  required: boolean = PAYMENT_REQUIRES_TAX_CERTIFICATE
): string | null {
  if (!required || certificate === "VALIDE") return null;
  return "Aucune attestation de régularité fiscale valide ne couvre cette facture : enregistrez-la avant le paiement.";
}
