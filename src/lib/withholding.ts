import { isoDayOf, parseIsoDay } from "./date-only";

/**
 * La retenue à la source et l'attestation de régularité fiscale (lot 3D,
 * RETOUR-LABO-28-10.md M7, le « NB » de l'e-mail du 28/10 : « L'attestation
 * de régularité fiscale devra obligatoirement être fournie par le
 * fournisseur avec chaque facture, afin de permettre l'application correcte
 * de la retenue à la source »).
 *
 * Pure: the routes, the screens and the purchase journal share exactly
 * these rules. **No rate is written here**: the scope, the base and both
 * rates are the administrator's settings (`AchatStockSettings`, edited on
 * /magasin/reglages), from the accountant's answer to R-24. Until then the
 * scope is AUCUN and nothing is withheld. Hypothèses, à confirmer par R-24:
 * - the rate depends on whether a valid attestation covers the invoice
 *   (« avec » / « sans » attestation), each a setting;
 * - an attestation covers an invoice when the one given WITH the invoice,
 *   or the supplier's last one, is valid ON the invoice's day: dated on or
 *   before it (one given with the invoice without a date stands for its
 *   day) and ending on or after it — an attestation dated after the
 *   invoice was not valid that day and is not counted for it (review of
 *   01/11);
 * - the state the retenue was computed with is stored on the invoice
 *   (`taxCertificateState`): an invoice covered when it was recorded stays
 *   covered when the supplier's attestation is later replaced by a newer
 *   one; one not covered then becomes covered only by an attestation
 *   recorded since whose period includes the invoice's day;
 * - its validity is the date typed from the document, or else its date plus
 *   the settings' months;
 * - net à payer = TTC − retenue; the payments are measured against it.
 */

export type WithholdingScopeCode = "AUCUN" | "FOURNISSEURS_SOUMIS" | "TOUS";
export type WithholdingBaseCode = "HT" | "TVA" | "TTC";

export const WITHHOLDING_SCOPE_LABELS: Record<WithholdingScopeCode, string> = {
  AUCUN: "Aucune retenue",
  FOURNISSEURS_SOUMIS: "Fournisseurs marqués « soumis à la retenue »",
  TOUS: "Tous les fournisseurs",
};

export const WITHHOLDING_BASE_LABELS: Record<WithholdingBaseCode, string> = {
  HT: "Montant HT",
  TVA: "Montant de la TVA",
  TTC: "Montant TTC",
};

export type WithholdingSettings = {
  scope: WithholdingScopeCode;
  base: WithholdingBaseCode;
  /** % with a valid attestation; null = nothing withheld. */
  rateWithCertificate: number | null;
  /** % without a valid attestation; null = nothing withheld. */
  rateWithoutCertificate: number | null;
  /** How long an attestation stays valid when its end is not typed. */
  certificateValidityMonths: number;
};

const cents = (value: number) => Math.round(value * 100);

/** Whether the retenue applies to a supplier under the settings' scope. */
export function withholdingApplies(scope: WithholdingScopeCode, supplierSubject: boolean): boolean {
  if (scope === "TOUS") return true;
  if (scope === "FOURNISSEURS_SOUMIS") return supplierSubject;
  return false;
}

/**
 * A calendar day (UTC midnight) plus whole months; the 31st of a shorter
 * month lands on its last day (31/01 + 1 month → 28 or 29/02).
 */
export function addMonths(day: Date, months: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() + months;
  const lastOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), lastOfTarget)));
}

/** The last day an attestation dated `date` is valid: the typed end, else its date + the months. */
export function certificateEnd(date: Date | null, validUntil: Date | null, months: number): Date | null {
  if (validUntil) return validUntil;
  if (!date) return null;
  // Valid for `months` months: the day before the same day `months` later.
  const end = addMonths(date, months);
  return new Date(end.getTime() - 86_400_000);
}

export type CertificateState = "VALIDE" | "EXPIREE" | "ABSENTE";

export const CERTIFICATE_STATE_LABELS: Record<CertificateState, string> = {
  VALIDE: "Attestation valide",
  EXPIREE: "Attestation expirée",
  ABSENTE: "Sans attestation",
};

export type CertificateFacts = {
  /** The invoice's day (UTC midnight). */
  issueDate: Date;
  /** Given with the invoice (the NB), and its date. */
  invoiceProvided: boolean | null;
  invoiceCertificateDate: Date | null;
  /** The supplier's last attestation. */
  supplierCertificateDate: Date | null;
  supplierCertificateValidUntil: Date | null;
  validityMonths: number;
};

const day = (date: Date) => isoDayOf(date);
/**
 * Whether an attestation is valid ON the invoice's day: it starts on or
 * before it (a null start = unknown, only its end typed) and ends on or
 * after it.
 */
const covers = (start: Date | null, until: Date | null, at: Date) =>
  !!until && day(until) >= day(at) && (!start || day(start) <= day(at));
/** An attestation that starts after the invoice's day says nothing about it. */
const startsAfter = (start: Date | null, at: Date) => !!start && day(start) > day(at);

/**
 * Whether a valid attestation covers an invoice: the one given with it, or
 * the supplier's last one, valid on the invoice's day. EXPIREE when one
 * dated on or before the day exists but had ended; ABSENTE when there is
 * none (an attestation dated after the invoice does not count for it).
 */
export function certificateState(facts: CertificateFacts): CertificateState {
  const invoiceStart = facts.invoiceProvided ? facts.invoiceCertificateDate ?? facts.issueDate : null;
  const withInvoice = invoiceStart ? certificateEnd(invoiceStart, null, facts.validityMonths) : null;
  if (invoiceStart && covers(invoiceStart, withInvoice, facts.issueDate)) return "VALIDE";
  const supplierEnd = certificateEnd(facts.supplierCertificateDate, facts.supplierCertificateValidUntil, facts.validityMonths);
  if (covers(facts.supplierCertificateDate, supplierEnd, facts.issueDate)) return "VALIDE";
  const invoiceKnown = !!invoiceStart && !startsAfter(invoiceStart, facts.issueDate);
  const supplierKnown = !!supplierEnd && !startsAfter(facts.supplierCertificateDate, facts.issueDate);
  return invoiceKnown || supplierKnown ? "EXPIREE" : "ABSENTE";
}

/**
 * The state an invoice reads: VALIDE when it was covered at its recording
 * (`recorded`, stored since the review of 01/11) — a newer attestation of
 * the supplier does not un-cover it —, else what the attestations known
 * today say about its day (`live`). An invoice of before has no stored
 * state: the live one.
 */
export function effectiveCertificateState(recorded: CertificateState | null, live: CertificateState): CertificateState {
  return recorded === "VALIDE" ? "VALIDE" : live;
}

/** The rate a new invoice starts with (editable): null when nothing is withheld. */
export function proposedWithholdingRate(
  settings: WithholdingSettings,
  supplierSubject: boolean,
  state: CertificateState
): number | null {
  if (!withholdingApplies(settings.scope, supplierSubject)) return null;
  return state === "VALIDE" ? settings.rateWithCertificate : settings.rateWithoutCertificate;
}

export type InvoiceAmounts = { ht: number | null; tva: number | null; ttc: number };

/** The amount the rate applies to; null when the invoice does not hold it (TTC-only invoice before lot 3D). */
export function withholdingBaseAmount(base: WithholdingBaseCode, amounts: InvoiceAmounts): number | null {
  if (base === "TTC") return amounts.ttc;
  return base === "HT" ? amounts.ht : amounts.tva;
}

/** The amount withheld, to the centime; 0 without a rate or a base. */
export function withholdingAmountFor(base: WithholdingBaseCode, rate: number | null, amounts: InvoiceAmounts): number {
  const baseAmount = withholdingBaseAmount(base, amounts);
  if (rate === null || rate <= 0 || baseAmount === null) return 0;
  return Math.round(cents(baseAmount) * rate / 100) / 100;
}

/**
 * Why a retenue cannot be recorded as typed, in French; null when it can
 * (review of 01/11):
 * - a rate on the HT or the TVA of an invoice entered with its TTC only
 *   would silently withhold 0 — the HT is required;
 * - a retenue that takes the whole TTC leaves nothing to pay: such an
 *   invoice could never be settled.
 */
export function withholdingRefusal(base: WithholdingBaseCode, rate: number | null, amounts: InvoiceAmounts): string | null {
  if (rate === null || rate <= 0) return null;
  if (withholdingBaseAmount(base, amounts) === null) {
    return `La retenue à la source se calcule sur le ${base === "HT" ? "montant HT" : "montant de la TVA"} : saisissez le montant HT.`;
  }
  if (Math.round(withholdingAmountFor(base, rate, amounts) * 100) >= Math.round(amounts.ttc * 100)) {
    return "La retenue à la source ne peut pas absorber tout le TTC : il ne resterait rien à payer.";
  }
  return null;
}

/** Net à payer = TTC − retenue (never below zero). */
export function netToPay(ttc: number, withheld: number | null): number {
  return Math.max(0, cents(ttc) - cents(withheld ?? 0)) / 100;
}

/** « AAAA-MM-JJ » of the day an attestation ends, for a date input; "" when none. */
export function certificateEndDay(date: Date | null, validUntil: Date | null, months: number): string {
  const end = certificateEnd(date, validUntil, months);
  return end ? isoDayOf(end) : "";
}

/** Parses a typed rate (« 75 », « 7,5 ») between 0 and 100; null for empty, NaN for unreadable. */
export function parseRate(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? Math.round(parsed * 100) / 100 : Number.NaN;
}

/** Whether a day string is a real calendar day. */
export const isDay = (value: string) => parseIsoDay(value) !== null;
