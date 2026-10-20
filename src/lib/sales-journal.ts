import type { InvoiceKind, InvoiceStatus, PaymentMode } from "@/generated/prisma/enums";
import { parseIsoDay } from "./date-only";
import {
  INVOICE_KIND_LABELS,
  INVOICE_STATE_LABELS,
  PAYMENT_MODE_LABELS,
  balance,
  invoiceState,
} from "./invoice-lifecycle";
import { formatIsoDay } from "./labels";
import { toMoney, type MoneyInput } from "./money";

/**
 * The accounting export of the invoices (journal des ventes et règlements,
 * spec EF-22) — pure: the rows of the two sheets of
 * `GET /api/invoices/export`, their totals, the period and the links.
 *
 * - « Journal des ventes »: one row per issued document (invoice or credit
 *   note) by date of issue. A credit note's amounts are negative, so a column
 *   sums to the net sales. A cancelled invoice keeps its row (its number is
 *   in the sequence) but stays out of the totals, like « Facturé »
 *   everywhere else (`billingFigures`). The client is named with its three
 *   identifiers — ICE, IF, RC (RETOUR-LABO-19-10.md H2, Q85) — as frozen
 *   on the document; its address is not exported (re-ask R-2).
 * - « Règlements »: one row per settlement by date of receipt.
 *
 * Money is summed in centimes (no float drift). Days are the laboratory's
 * calendar days, handed to Excel as UTC midnights so the cell shows that
 * day whatever the reader's time zone.
 */

export const EXPORT_PATH = "/api/invoices/export";
export const MAX_EXPORT_ROWS = 20_000;

export type SalesJournalInvoice = {
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issuedAt: Date;
  subtotal: MoneyInput;
  taxAmount: MoneyInput;
  total: MoneyInput;
  /** The client's identity as kept by the document (`invoiceClientIdentity`). */
  client: { name: string; ice: string | null; fiscalId: string | null; tradeRegister: string | null };
  creditedInvoice: { number: string | null } | null;
  /** Every settlement of the invoice (to compute what is left today). */
  payments: MoneyInput[];
  /** Every credit note issued against it. */
  creditNotes: MoneyInput[];
};

export type SalesJournalRow = {
  /** The lab's calendar day of issue, as a UTC midnight (an Excel date). */
  day: Date;
  number: string;
  type: string;
  /** Credit note only: the invoice it corrects. */
  originNumber: string;
  client: string;
  ice: string;
  /** IF (identifiant fiscal); empty when the document does not hold one. */
  fiscalId: string;
  /** RC (registre de commerce); empty when the document does not hold one. */
  tradeRegister: string;
  /** Negative for a credit note. */
  ht: number;
  tva: number;
  ttc: number;
  state: string;
  cancelled: boolean;
  /** Null for a credit note or a cancelled invoice: nothing to collect. */
  remaining: number | null;
};

export type SettlementInput = {
  paidAt: Date;
  amount: MoneyInput;
  mode: PaymentMode;
  reference: string | null;
  invoice: { number: string | null; client: { name: string } };
};

export type SettlementRow = {
  day: Date;
  invoice: string;
  client: string;
  mode: string;
  amount: number;
  reference: string;
};

const cents = (value: MoneyInput) => Math.round(toMoney(value) * 100);
const sumCents = (values: MoneyInput[]) => values.reduce<number>((total, value) => total + cents(value), 0);

/** The laboratory's calendar day of an instant, as the UTC midnight Excel shows as that day. */
export function excelDay(at: Date): Date {
  // formatIsoDay always yields a real « AAAA-MM-JJ ».
  return parseIsoDay(formatIsoDay(at)) as Date;
}

export function salesJournalRows(invoices: SalesJournalInvoice[]): SalesJournalRow[] {
  return invoices.map((invoice) => {
    const sign = invoice.kind === "AVOIR" ? -1 : 1;
    const paidCents = sumCents(invoice.payments);
    const creditedCents = sumCents(invoice.creditNotes);
    const cancelled = invoice.status === "ANNULEE";
    const collectable = invoice.kind === "FACTURE" && !cancelled;
    const state = invoiceState({
      status: invoice.status,
      kind: invoice.kind,
      total: invoice.total,
      paid: paidCents / 100,
      credited: creditedCents / 100,
    });
    return {
      day: excelDay(invoice.issuedAt),
      number: invoice.number ?? "",
      type: INVOICE_KIND_LABELS[invoice.kind],
      originNumber: invoice.kind === "AVOIR" ? (invoice.creditedInvoice?.number ?? "") : "",
      client: invoice.client.name,
      ice: invoice.client.ice ?? "",
      fiscalId: invoice.client.fiscalId ?? "",
      tradeRegister: invoice.client.tradeRegister ?? "",
      ht: (sign * cents(invoice.subtotal)) / 100,
      tva: (sign * cents(invoice.taxAmount)) / 100,
      ttc: (sign * cents(invoice.total)) / 100,
      state: INVOICE_STATE_LABELS[state],
      cancelled,
      remaining: collectable ? balance(invoice.total, paidCents / 100, creditedCents / 100) : null,
    };
  });
}

/** One column of the « Journal des ventes » sheet; `format`: the cell's Excel number format. */
export type SalesJournalColumn = {
  header: string;
  key: keyof SalesJournalRow;
  width: number;
  format?: "day" | "money";
};

/**
 * The « Journal des ventes » sheet's columns, in order. `asOf`: the day
 * « Reste à payer » is computed (« JJ/MM/AAAA »). The client's three
 * identifiers follow its name (H2).
 */
export function salesJournalColumns(asOf: string): SalesJournalColumn[] {
  return [
    { header: "Date", key: "day", width: 12, format: "day" },
    { header: "N°", key: "number", width: 16 },
    { header: "Facture / Avoir", key: "type", width: 14 },
    { header: "N° de facture d'origine", key: "originNumber", width: 22 },
    { header: "Client", key: "client", width: 32 },
    { header: "ICE", key: "ice", width: 18 },
    { header: "IF", key: "fiscalId", width: 14 },
    { header: "RC", key: "tradeRegister", width: 18 },
    { header: "HT", key: "ht", width: 14, format: "money" },
    { header: "TVA", key: "tva", width: 12, format: "money" },
    { header: "TTC", key: "ttc", width: 14, format: "money" },
    { header: "État", key: "state", width: 20 },
    { header: "Annulée", key: "cancelled", width: 10 },
    { header: `Reste à payer au ${asOf}`, key: "remaining", width: 22, format: "money" },
  ];
}

/** The totals row: every document but the cancelled invoices; credit notes deducted. */
export function salesJournalTotals(rows: SalesJournalRow[]) {
  const kept = rows.filter((row) => !row.cancelled);
  return {
    ht: sumCents(kept.map((row) => row.ht)) / 100,
    tva: sumCents(kept.map((row) => row.tva)) / 100,
    ttc: sumCents(kept.map((row) => row.ttc)) / 100,
    remaining: sumCents(kept.map((row) => row.remaining ?? 0)) / 100,
    cancelledCount: rows.length - kept.length,
  };
}

export function settlementRows(payments: SettlementInput[]): SettlementRow[] {
  return payments.map((payment) => ({
    day: excelDay(payment.paidAt),
    invoice: payment.invoice.number ?? "",
    client: payment.invoice.client.name,
    mode: PAYMENT_MODE_LABELS[payment.mode],
    amount: cents(payment.amount) / 100,
    reference: payment.reference ?? "",
  }));
}

export function settlementsTotal(rows: SettlementRow[]): number {
  return sumCents(rows.map((row) => row.amount)) / 100;
}

/**
 * A `du` / `au` that is present but not a real day is refused (400) rather
 * than silently widened to every document ever issued. Empty = open side.
 */
export function exportPeriodError(du: string | null, au: string | null): string | null {
  if (du?.trim() && !parseIsoDay(du.trim())) return "La date de début est invalide (AAAA-MM-JJ).";
  if (au?.trim() && !parseIsoDay(au.trim())) return "La date de fin est invalide (AAAA-MM-JJ).";
  return null;
}

/** The export's address; an empty side of the period is left out. */
export function salesJournalHref(period: { du?: string; au?: string }): string {
  const params = new URLSearchParams();
  if (period.du) params.set("du", period.du);
  if (period.au) params.set("au", period.au);
  const query = params.toString();
  return query ? `${EXPORT_PATH}?${query}` : EXPORT_PATH;
}

/** « journal-des-ventes-2026-10-01-au-2026-10-31.xlsx »; `today` stamps an open period. */
export function salesJournalFileName(fromDay: string | null, toDay: string | null, today: string): string {
  const period =
    fromDay && toDay
      ? `${fromDay}-au-${toDay}`
      : fromDay
        ? `depuis-${fromDay}`
        : toDay
          ? `jusqu-au-${toDay}`
          : `au-${today}`;
  return `journal-des-ventes-${period}.xlsx`;
}

/** The file name a `Content-Disposition` header carries, or null. */
export function attachmentFileName(header: string | null): string | null {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match ? match[1] : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The quick periods offered next to the dates, in the order `exportPresets` returns them. */
export const EXPORT_PRESET_LABELS = ["Mois en cours", "Mois précédent", "Année en cours"] as const;

/**
 * The quick periods, from today's « AAAA-MM-JJ » on the lab's clock: the
 * month so far, the previous month, the year so far.
 */
export function exportPresets(today: string): { label: string; du: string; au: string }[] {
  const date = parseIsoDay(today);
  if (!date) return [];
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const previousYear = month === 0 ? year - 1 : year;
  const previousMonth = month === 0 ? 11 : month - 1;
  // Day 0 of a month is the last day of the month before it.
  const previousLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const [thisMonth, lastMonth, thisYear] = EXPORT_PRESET_LABELS;
  return [
    { label: thisMonth, du: `${year}-${pad(month + 1)}-01`, au: today },
    {
      label: lastMonth,
      du: `${previousYear}-${pad(previousMonth + 1)}-01`,
      au: `${previousYear}-${pad(previousMonth + 1)}-${pad(previousLast)}`,
    },
    { label: thisYear, du: `${year}-01-01`, au: today },
  ];
}
