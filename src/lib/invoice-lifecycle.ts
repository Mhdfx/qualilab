import type { InvoiceKind, InvoiceStatus, PaymentMode } from "@/generated/prisma/enums";
import { toMoney, type MoneyInput } from "./money";
import { computeInvoiceTotals, roundMoney, type InvoiceTotals } from "./invoice-math";
import { formatCurrency } from "./labels";

/**
 * The life of an invoice (FACTURATION.md): draft, issue, cancellation,
 * credit notes, settlements.
 *
 * This is the ONLY place that decides what may be done to an invoice and
 * what it reads as. The routes load the invoice, its settlements and its
 * credit notes, ask here, then write — so a screen, a route and the PDF can
 * never disagree on « Partiellement payée » or on what is left to pay.
 *
 * All amounts are TTC and handled in centimes: every value goes through
 * `toMoney()` (DECIMAL columns arrive as objects or strings) and comparisons
 * are made on rounded centimes, never on raw floating point.
 */

/** What an invoice reads as, on the fiche, the list and the PDF. Never stored. */
export type InvoiceState =
  | "BROUILLON"
  | "EMISE"
  | "PARTIELLEMENT_PAYEE"
  | "PAYEE"
  | "ANNULEE"
  | "AVOIR";

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  BROUILLON: "Brouillon",
  EMISE: "Émise",
  PARTIELLEMENT_PAYEE: "Partiellement payée",
  PAYEE: "Payée",
  ANNULEE: "Annulée",
  AVOIR: "Avoir",
};

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  FACTURE: "Facture",
  AVOIR: "Avoir",
};

/** Every mode, for the PDF and the history (AUTRE: the migrated « Repris » settlements). */
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  EFFET: "Effet",
  CARTE: "Carte",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

/** The modes offered when recording a settlement — AUTRE is never typed by hand. */
export const RECORDABLE_PAYMENT_MODES: readonly PaymentMode[] = [
  "ESPECES",
  "CHEQUE",
  "EFFET",
  "CARTE",
  "VIREMENT",
];

export function isRecordablePaymentMode(value: unknown): value is PaymentMode {
  return typeof value === "string" && (RECORDABLE_PAYMENT_MODES as readonly string[]).includes(value);
}

const cents = (value: MoneyInput) => Math.round(toMoney(value) * 100);
const fromCents = (value: number) => roundMoney(value / 100);

/**
 * Reste à payer = total TTC − credit notes − settlements, never negative
 * (FACTURATION.md §3).
 */
export function balance(total: MoneyInput, paid: MoneyInput, credited: MoneyInput): number {
  return fromCents(Math.max(0, cents(total) - cents(credited) - cents(paid)));
}

/** What credit notes may still take off an invoice: total TTC − credit notes already issued. */
export function remainingCreditable(total: MoneyInput, credited: MoneyInput): number {
  return fromCents(Math.max(0, cents(total) - cents(credited)));
}

/** The stored status once the settlements change: PAYEE when nothing is left to pay. */
export function statusAfterPayments(
  total: MoneyInput,
  paid: MoneyInput,
  credited: MoneyInput
): "EN_ATTENTE" | "PAYEE" {
  return balance(total, paid, credited) === 0 ? "PAYEE" : "EN_ATTENTE";
}

export type InvoiceStateInput = {
  status: InvoiceStatus;
  kind: InvoiceKind;
  /** Total TTC. */
  total: MoneyInput;
  /** Sum of the settlements. */
  paid: MoneyInput;
  /** Sum of the credit notes issued against it. */
  credited: MoneyInput;
};

/**
 * How an invoice reads. A credit note is always « Avoir »; a draft or a
 * cancelled invoice reads as such whatever the amounts; an issued invoice is
 * « Payée » when nothing is left to pay, « Partiellement payée » when a
 * settlement was received and something is left, « Émise » otherwise.
 */
export function invoiceState(input: InvoiceStateInput): InvoiceState {
  if (input.kind === "AVOIR") return "AVOIR";
  if (input.status === "BROUILLON") return "BROUILLON";
  if (input.status === "ANNULEE") return "ANNULEE";
  if (balance(input.total, input.paid, input.credited) === 0) return "PAYEE";
  return cents(input.paid) > 0 ? "PARTIELLEMENT_PAYEE" : "EMISE";
}

type LifecycleInvoice = { status: InvoiceStatus; kind: InvoiceKind };

/** A draft is edited (client, lines, due date, notes, VAT) and deleted until it is issued. */
export function canEditDraft(invoice: LifecycleInvoice): boolean {
  return invoice.kind === "FACTURE" && invoice.status === "BROUILLON";
}

/** Only a draft invoice is issued; a credit note is issued at creation. */
export function canIssue(invoice: LifecycleInvoice): boolean {
  return canEditDraft(invoice);
}

/** True once the invoice carries a number (any status but BROUILLON). */
export function isIssued(invoice: LifecycleInvoice): boolean {
  return invoice.status !== "BROUILLON";
}

/**
 * Why an invoice may not be cancelled, in French for the 409 — or null when
 * it may: an issued invoice (EN_ATTENTE) with no settlement and no credit
 * note. With a settlement, the way out is a credit note.
 */
export function cancelRefusal(
  invoice: LifecycleInvoice & { credited?: MoneyInput },
  paymentsCount: number
): string | null {
  if (invoice.kind === "AVOIR") return "Un avoir ne s'annule pas.";
  if (invoice.status === "BROUILLON") return "Un brouillon ne s'annule pas : supprimez-le.";
  if (invoice.status === "ANNULEE") return "Cette facture est déjà annulée.";
  if (paymentsCount > 0) {
    return "Cette facture a reçu un règlement : elle ne peut plus être annulée. Établissez un avoir.";
  }
  if (cents(invoice.credited) > 0) {
    return "Cette facture a déjà un avoir : elle ne peut plus être annulée. Établissez un nouvel avoir.";
  }
  // Soldée without a settlement nor a credit note: a total of 0,00.
  if (invoice.status === "PAYEE") return "Cette facture est soldée : elle ne peut plus être annulée.";
  return null;
}

export function canCancel(
  invoice: LifecycleInvoice & { credited?: MoneyInput },
  paymentsCount: number
): boolean {
  return cancelRefusal(invoice, paymentsCount) === null;
}

/** A cancellation or a settlement deletion needs a written reason. */
export function checkReason(reason: unknown): string | null {
  if (typeof reason !== "string" || reason.trim().length < 3) return "Indiquez le motif (au moins 3 caractères).";
  // Printed on the « ANNULÉE » stamp and kept in the journal: bounded.
  if (reason.trim().length > 5000) return "Le motif est trop long (5 000 caractères max).";
  return null;
}

/**
 * A settlement: a positive amount in centimes, never more than what is left
 * to pay. Returns the French error, or null when the amount is acceptable.
 */
export function checkPayment(amount: unknown, balanceDue: MoneyInput): string | null {
  const value = typeof amount === "number" ? amount : typeof amount === "string" ? Number(amount.replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return "Le montant du règlement doit être supérieur à zéro.";
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    return "Le montant du règlement ne peut pas dépasser deux décimales.";
  }
  const due = cents(balanceDue);
  if (due === 0) return "Cette facture est soldée : il ne reste rien à payer.";
  if (Math.round(value * 100) > due) {
    return `Le règlement dépasse le reste à payer (${formatCurrency(fromCents(due))}).`;
  }
  return null;
}

export type CreditNoteLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  /** The invoice line it takes back, when it is not a free line. */
  invoiceItemId?: string | null;
};

export type CreditNoteCheck =
  | { ok: true; totals: InvoiceTotals }
  | { ok: false; error: string };

/**
 * A credit note: at least one line, each with a description, a positive
 * quantity and a non-negative unit price (amounts positive, like an
 * invoice); a total TTC above zero and within what may still be credited.
 * Computed at the invoice's VAT rate, so `totals` is what to store.
 */
export function checkCreditNote(
  lines: readonly CreditNoteLine[],
  remainingCreditableAmount: MoneyInput,
  taxRate: number
): CreditNoteCheck {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: "Un avoir comporte au moins une ligne." };
  }
  for (const [index, line] of lines.entries()) {
    const position = `Ligne ${index + 1}`;
    if (typeof line.description !== "string" || !line.description.trim()) {
      return { ok: false, error: `${position} : la désignation est obligatoire.` };
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { ok: false, error: `${position} : la quantité doit être supérieure à zéro.` };
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      return { ok: false, error: `${position} : le prix unitaire ne peut pas être négatif.` };
    }
  }
  const totals = computeInvoiceTotals(lines, taxRate);
  if (cents(totals.total) <= 0) {
    return { ok: false, error: "Le montant de l'avoir doit être supérieur à zéro." };
  }
  const remaining = cents(remainingCreditableAmount);
  if (cents(totals.total) > remaining) {
    return {
      ok: false,
      error:
        remaining === 0
          ? "Cette facture est déjà entièrement couverte par des avoirs."
          : `Le total de l'avoir (${formatCurrency(totals.total)} TTC) dépasse le montant encore créditable (${formatCurrency(fromCents(remaining))}).`,
    };
  }
  return { ok: true, totals };
}
