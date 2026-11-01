import type { PaymentMode } from "@/generated/prisma/enums";
import { parseIsoDay } from "./date-only";
import { toMoney, type MoneyInput } from "./money";
import { purchaseBalance, purchaseStatusLabel, PURCHASE_PAYMENT_METHOD_LABELS, type PurchaseStatus } from "./purchase-invoice";
import { dueState } from "./stock";
import {
  CERTIFICATE_STATE_LABELS,
  WITHHOLDING_BASE_LABELS,
  withholdingBaseAmount,
  type CertificateState,
  type WithholdingBaseCode,
} from "./withholding";

/**
 * Le « Journal des achats » (lot 3D, RETOUR-LABO-28-10.md M2, fichier 3.3) —
 * pure: the rows, columns and totals of `GET /api/purchase-invoices/export`,
 * on the model of `sales-journal.ts`.
 *
 * - Sheet « Journal des achats »: the laboratory's 13 columns IN THEIR ORDER
 *   (Fournisseurs | Délai de paiement | N° Facture | Mois | Date | Échéance |
 *   Montant HT | TVA | Montant TTC | Euro | Statut | Date paiement | Mode de
 *   paiement), then ours: the VAT rate, the currency, the retenue à la
 *   source (M7), the net à payer, what is paid and left, the attestation,
 *   the payment's reference, the label. An automatic filter on the header
 *   row, a totals row. Their « TVA 20% » reads « TVA » with the rate in its
 *   own column (an invoice at another rate would lie under « 20% »).
 * - Sheet « Retenues à la source »: the état mensuel des retenues — every
 *   invoice of the period with an amount withheld.
 * - Sheet « Paiements »: the payments of the period, by day.
 *
 * « Euro » (hypothèse R-23): the invoice's amount in euros when it was
 * recorded in EUR; another currency goes to « Devise » / « Montant en
 * devise ». A cancelled invoice (« Annuler la saisie ») is not in the
 * journal: it was never an invoice. Days are the invoices' calendar days
 * (UTC midnights, what Excel shows as that day). Money summed in centimes.
 */

export const PURCHASE_EXPORT_PATH = "/api/purchase-invoices/export";
export const MAX_PURCHASE_EXPORT_ROWS = 20_000;

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « octobre 2026 » — the journal's « Mois » column. */
export function monthLabel(day: Date): string {
  return `${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** « 30 jours », « Comptant » — the journal's « Délai de paiement ». */
export function paymentTermLabel(days: number): string {
  return days === 0 ? "Comptant" : `${days} jour${days > 1 ? "s" : ""}`;
}

export type PurchaseJournalPayment = {
  paidOn: Date;
  amount: MoneyInput;
  method: PaymentMode;
  reference: string | null;
};

export type PurchaseJournalInvoice = {
  supplier: { name: string; ice: string | null; paymentTermDays: number };
  number: string;
  label: string | null;
  issueDate: Date;
  dueDate: Date;
  status: PurchaseStatus;
  /** Before lot 3D: the instant « Marquer payée » was clicked. */
  paidAt: Date | null;
  amount: MoneyInput;
  amountHT: MoneyInput;
  vatRate: MoneyInput;
  vatAmount: MoneyInput;
  currency: string | null;
  amountForeign: MoneyInput;
  exchangeRate: MoneyInput;
  paymentMethod: PaymentMode | null;
  paymentReference: string | null;
  withholdingRate: MoneyInput;
  withholdingAmount: MoneyInput;
  /** The base the retenue was computed on (stored since the review of 01/11); null = before: the settings'. */
  withholdingBase?: WithholdingBaseCode | null;
  /** Computed by the caller with `certificateState` (withholding.ts). */
  certificate: CertificateState;
  payments: PurchaseJournalPayment[];
};

export type PurchaseJournalRow = {
  supplier: string;
  paymentTerm: string;
  number: string;
  month: string;
  day: Date;
  dueDay: Date;
  ht: number | null;
  tva: number | null;
  ttc: number;
  euro: number | null;
  status: string;
  paidDay: Date | null;
  paymentMode: string;
  vatRate: number | null;
  currency: string;
  amountForeign: number | null;
  exchangeRate: number | null;
  withholdingRate: number | null;
  withholding: number;
  net: number;
  paid: number;
  remaining: number;
  certificate: string;
  reference: string;
  label: string;
};

const has = (value: MoneyInput) => value !== null && value !== undefined;
const money = (value: MoneyInput) => (has(value) ? toMoney(value) : null);
const cents = (value: number | null) => Math.round((value ?? 0) * 100);
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + cents(value), 0) / 100;

/** The UTC midnight of the lab's calendar day of an instant (a legacy `paidAt`). */
function dayOfInstant(at: Date, labDay: (date: Date) => string): Date {
  return parseIsoDay(labDay(at)) as Date;
}

export function purchaseJournalRows(
  invoices: PurchaseJournalInvoice[],
  options: { now: Date; labDay: (date: Date) => string }
): PurchaseJournalRow[] {
  return invoices.map((invoice) => {
    const payments = invoice.payments.map((payment) => toMoney(payment.amount));
    const withholding = toMoney(invoice.withholdingAmount);
    const figures = { status: invoice.status, amount: toMoney(invoice.amount), withholdingAmount: withholding, payments };
    const { net, paid, remaining } = purchaseBalance(figures);
    const due = invoice.status === "A_PAYER" ? dueState(invoice.dueDate, options.now) : "OK";
    const lastPayment = [...invoice.payments].sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime()).at(-1);
    const paidDay = lastPayment ? lastPayment.paidOn : invoice.paidAt ? dayOfInstant(invoice.paidAt, options.labDay) : null;
    const method = lastPayment?.method ?? invoice.paymentMethod;
    const isEuro = invoice.currency === "EUR";
    return {
      supplier: invoice.supplier.name,
      paymentTerm: paymentTermLabel(invoice.supplier.paymentTermDays),
      number: invoice.number,
      month: monthLabel(invoice.issueDate),
      day: invoice.issueDate,
      dueDay: invoice.dueDate,
      ht: money(invoice.amountHT),
      tva: money(invoice.vatAmount),
      ttc: toMoney(invoice.amount),
      euro: isEuro ? money(invoice.amountForeign) : null,
      status: purchaseStatusLabel(figures, due),
      paidDay: paid > 0 || invoice.status === "PAYEE" ? paidDay : null,
      paymentMode: method ? PURCHASE_PAYMENT_METHOD_LABELS[method] : "",
      vatRate: money(invoice.vatRate),
      currency: invoice.currency && !isEuro ? invoice.currency : "",
      amountForeign: invoice.currency && !isEuro ? money(invoice.amountForeign) : null,
      exchangeRate: has(invoice.exchangeRate) ? Number(invoice.exchangeRate?.toString()) : null,
      withholdingRate: money(invoice.withholdingRate),
      withholding,
      net,
      paid,
      remaining,
      certificate: CERTIFICATE_STATE_LABELS[invoice.certificate],
      reference: lastPayment?.reference ?? invoice.paymentReference ?? "",
      label: invoice.label ?? "",
    };
  });
}

export type PurchaseJournalColumn = {
  header: string;
  key: keyof PurchaseJournalRow;
  width: number;
  format?: "day" | "money" | "rate";
};

/** The laboratory's 13 columns, in their order (the template « Journal Achat »). */
export const LAB_PURCHASE_COLUMNS: PurchaseJournalColumn[] = [
  { header: "Fournisseurs", key: "supplier", width: 30 },
  { header: "Délai de paiement", key: "paymentTerm", width: 16 },
  { header: "N° Facture", key: "number", width: 16 },
  { header: "Mois", key: "month", width: 15 },
  { header: "Date", key: "day", width: 12, format: "day" },
  { header: "Échéance", key: "dueDay", width: 12, format: "day" },
  { header: "Montant HT", key: "ht", width: 14, format: "money" },
  { header: "TVA", key: "tva", width: 12, format: "money" },
  { header: "Montant TTC", key: "ttc", width: 14, format: "money" },
  { header: "Euro", key: "euro", width: 12, format: "money" },
  { header: "Statut", key: "status", width: 18 },
  { header: "Date paiement", key: "paidDay", width: 14, format: "day" },
  { header: "Mode de paiement", key: "paymentMode", width: 16 },
];

/** Ours, after theirs: the rate, the currency, the retenue (M7), the balance, the attestation. */
export const EXTRA_PURCHASE_COLUMNS: PurchaseJournalColumn[] = [
  { header: "Taux TVA (%)", key: "vatRate", width: 11, format: "rate" },
  { header: "Devise", key: "currency", width: 8 },
  { header: "Montant en devise", key: "amountForeign", width: 16, format: "money" },
  { header: "Taux de change", key: "exchangeRate", width: 13 },
  { header: "Taux de retenue (%)", key: "withholdingRate", width: 16, format: "rate" },
  { header: "Retenue à la source", key: "withholding", width: 16, format: "money" },
  { header: "Net à payer", key: "net", width: 14, format: "money" },
  { header: "Montant payé", key: "paid", width: 14, format: "money" },
  { header: "Reste à payer", key: "remaining", width: 14, format: "money" },
  { header: "Attestation fiscale", key: "certificate", width: 20 },
  { header: "Référence du paiement", key: "reference", width: 20 },
  { header: "Libellé", key: "label", width: 28 },
];

export const PURCHASE_JOURNAL_COLUMNS = [...LAB_PURCHASE_COLUMNS, ...EXTRA_PURCHASE_COLUMNS];

export type PurchaseJournalTotals = Pick<PurchaseJournalRow, "ttc" | "withholding" | "net" | "paid" | "remaining"> & {
  ht: number;
  tva: number;
  euro: number;
  /** Invoices recorded with their TTC only (before lot 3D): their HT and TVA are not in the totals. */
  ttcOnly: number;
};

export function purchaseJournalTotals(rows: PurchaseJournalRow[]): PurchaseJournalTotals {
  return {
    ht: sum(rows.map((row) => row.ht)),
    tva: sum(rows.map((row) => row.tva)),
    ttc: sum(rows.map((row) => row.ttc)),
    euro: sum(rows.map((row) => row.euro)),
    withholding: sum(rows.map((row) => row.withholding)),
    net: sum(rows.map((row) => row.net)),
    paid: sum(rows.map((row) => row.paid)),
    remaining: sum(rows.map((row) => row.remaining)),
    ttcOnly: rows.filter((row) => row.ht === null).length,
  };
}

// ————— État mensuel des retenues (M7) —————

export type WithholdingRow = {
  supplier: string;
  ice: string;
  number: string;
  day: Date;
  base: string;
  baseAmount: number | null;
  rate: number | null;
  amount: number;
  certificate: string;
};

/**
 * The état des retenues: each invoice with an amount withheld, on the base
 * its retenue was computed on — stored with it; `settingsBase` only for an
 * invoice recorded before the base was stored.
 */
export function withholdingRows(invoices: PurchaseJournalInvoice[], settingsBase: WithholdingBaseCode): WithholdingRow[] {
  return invoices
    .filter((invoice) => invoice.status !== "ANNULEE" && toMoney(invoice.withholdingAmount) > 0)
    .map((invoice) => ({ invoice, base: invoice.withholdingBase ?? settingsBase }))
    .map(({ invoice, base }) => ({
      supplier: invoice.supplier.name,
      ice: invoice.supplier.ice ?? "",
      number: invoice.number,
      day: invoice.issueDate,
      base: WITHHOLDING_BASE_LABELS[base],
      baseAmount: withholdingBaseAmount(base, {
        ht: money(invoice.amountHT),
        tva: money(invoice.vatAmount),
        ttc: toMoney(invoice.amount),
      }),
      rate: money(invoice.withholdingRate),
      amount: toMoney(invoice.withholdingAmount),
      certificate: CERTIFICATE_STATE_LABELS[invoice.certificate],
    }));
}

export function withholdingTotal(rows: WithholdingRow[]): number {
  return sum(rows.map((row) => row.amount));
}

// ————— Paiements de la période —————

export type PurchasePaymentRow = { day: Date; supplier: string; number: string; method: string; amount: number; reference: string };

export function purchasePaymentRows(
  payments: (PurchaseJournalPayment & { invoice: { number: string; supplier: { name: string } } })[]
): PurchasePaymentRow[] {
  return payments.map((payment) => ({
    day: payment.paidOn,
    supplier: payment.invoice.supplier.name,
    number: payment.invoice.number,
    method: PURCHASE_PAYMENT_METHOD_LABELS[payment.method],
    amount: toMoney(payment.amount),
    reference: payment.reference ?? "",
  }));
}

export function purchasePaymentsTotal(rows: PurchasePaymentRow[]): number {
  return sum(rows.map((row) => row.amount));
}

// ————— La période : un mois, une année, ou du … au … —————

export type PurchasePeriod = {
  /** Inclusive first day, UTC midnight; null = open. */
  from: Date | null;
  /** Exclusive end, UTC midnight; null = open. */
  until: Date | null;
  /** For the file name: « 2026-10 », « 2026 », « 2026-10-01-au-2026-10-15 », … */
  slug: string | null;
};

const nextDay = (day: Date) => new Date(day.getTime() + 86_400_000);

/**
 * `?mois=AAAA-MM` (a month), `?annee=AAAA` (a year), or `?du=` / `?au=`
 * (inclusive days, either side optional); nothing = every invoice. A value
 * present but unreadable is refused rather than widened to everything.
 */
export function purchasePeriod(params: {
  mois?: string | null;
  annee?: string | null;
  du?: string | null;
  au?: string | null;
}): { ok: true; period: PurchasePeriod } | { ok: false; error: string } {
  const mois = params.mois?.trim();
  if (mois) {
    const match = /^(\d{4})-(\d{2})$/.exec(mois);
    const month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12) return { ok: false, error: "Le mois est invalide (AAAA-MM)." };
    const year = Number(match[1]);
    return {
      ok: true,
      period: { from: new Date(Date.UTC(year, month - 1, 1)), until: new Date(Date.UTC(year, month, 1)), slug: mois },
    };
  }
  const annee = params.annee?.trim();
  if (annee) {
    if (!/^\d{4}$/.test(annee)) return { ok: false, error: "L'année est invalide (AAAA)." };
    const year = Number(annee);
    return { ok: true, period: { from: new Date(Date.UTC(year, 0, 1)), until: new Date(Date.UTC(year + 1, 0, 1)), slug: annee } };
  }
  const du = params.du?.trim() || null;
  const au = params.au?.trim() || null;
  const from = du ? parseIsoDay(du) : null;
  const to = au ? parseIsoDay(au) : null;
  if (du && !from) return { ok: false, error: "La date de début est invalide (AAAA-MM-JJ)." };
  if (au && !to) return { ok: false, error: "La date de fin est invalide (AAAA-MM-JJ)." };
  if (from && to && to.getTime() < from.getTime()) return { ok: false, error: "La fin de la période précède son début." };
  const slug = from && to ? `${du}-au-${au}` : from ? `depuis-${du}` : to ? `jusqu-au-${au}` : null;
  return { ok: true, period: { from, until: to ? nextDay(to) : null, slug } };
}

/** « journal-des-achats-2026-10.xlsx »; `today` stamps an open period. */
export function purchaseJournalFileName(period: PurchasePeriod, today: string): string {
  return `journal-des-achats-${period.slug ?? `au-${today}`}.xlsx`;
}

/** The export's address for a month « AAAA-MM » or a year « AAAA » (empty = everything). */
export function purchaseJournalHref(choice: { mois?: string; annee?: string }): string {
  const params = new URLSearchParams();
  if (choice.mois) params.set("mois", choice.mois);
  else if (choice.annee) params.set("annee", choice.annee);
  const query = params.toString();
  return query ? `${PURCHASE_EXPORT_PATH}?${query}` : PURCHASE_EXPORT_PATH;
}

/** « AAAA-MM » of a calendar day — the default month offered (today's). */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

