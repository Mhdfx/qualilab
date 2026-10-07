import { toMoney, type MoneyInput } from "./money";
import { roundMoney } from "./invoice-math";
import { SAMPLE_TYPE_LABELS, formatCurrency, formatIsoDay } from "./labels";
import type { Prisma, SampleType } from "@/generated/prisma/client";
import type { InvoiceKind, InvoiceStatus } from "@/generated/prisma/enums";
import {
  balance,
  canCancel,
  canEditDraft,
  canIssue,
  invoiceState,
  remainingCreditable,
  type CreditNoteLine,
  type InvoiceState,
} from "./invoice-lifecycle";

/**
 * Turning analyses into invoice lines.
 *
 * The client asked that a validated sample's analyses become the lines of the
 * invoice, at catalogue prices — and that they keep control of how those lines
 * are named. So this proposes the lines; the accountant may rename any of them
 * before issuing, and a service missing from the catalogue is surfaced rather
 * than silently priced at zero.
 *
 * Kept pure so the rule can be tested without a database.
 */

export type CatalogueEntry = {
  name: string;
  category: string;
  unitPrice: number;
  active: boolean;
};

export type BillableSample = {
  id: string;
  controlCode: string | null;
  code: string;
  type: SampleType;
  produit: string | null;
  parameters: { name: string }[];
};

export type ProposedLine = {
  sampleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** True when no catalogue entry matched — the price must be set by hand. */
  unpriced: boolean;
};

/**
 * The catalogue is keyed by name and domain: "E. coli" costs one price on food
 * and another on water.
 */
export function catalogueKey(name: string, category: string) {
  return `${category}::${name}`.toLowerCase();
}

const key = catalogueKey;

export function buildCatalogueIndex(entries: CatalogueEntry[]) {
  const index = new Map<string, CatalogueEntry>();
  for (const entry of entries) {
    if (!entry.active) continue;
    index.set(key(entry.name, entry.category), entry);
  }
  return index;
}

/** How a line reads on the invoice: the analysis, then what it was run on. */
export function lineDescription(
  parameterName: string,
  sample: BillableSample
): string {
  const reference = sample.controlCode ?? sample.code;
  const subject = sample.produit ? ` — ${sample.produit}` : "";
  return `${parameterName} (${SAMPLE_TYPE_LABELS[sample.type]})${subject} · ${reference}`;
}

export function proposeLines(
  samples: BillableSample[],
  catalogue: CatalogueEntry[]
): ProposedLine[] {
  const index = buildCatalogueIndex(catalogue);
  const lines: ProposedLine[] = [];

  for (const sample of samples) {
    for (const parameter of sample.parameters) {
      const entry = index.get(key(parameter.name, sample.type));
      lines.push({
        sampleId: sample.id,
        description: lineDescription(parameter.name, sample),
        quantity: 1,
        unitPrice: entry ? toMoney(entry.unitPrice) : 0,
        // Flagged, never guessed: an unpriced analysis is the accountant's call.
        unpriced: !entry,
      });
    }
  }

  return lines;
}

/* ------------------------------------------------------------------------ *
 * Invoices: what holds a sample, what a typed line is worth, what is owed
 * (FACTURATION.md §1–4). Pure — the routes in src/app/api/invoices ask here,
 * then write.
 * ------------------------------------------------------------------------ */

/**
 * The invoice statuses whose lines hold their sample: a draft reserves it, an
 * issued invoice bills it, whether paid or not. A cancelled invoice releases
 * its samples; a credit note never carries one (it takes amounts back, not
 * samples — FACTURATION.md §2), so only FACTURE counts.
 */
export const SAMPLE_HOLDING_STATUSES: readonly InvoiceStatus[] = ["BROUILLON", "EN_ATTENTE", "PAYEE"];

/** True when the lines of this invoice keep their samples off the billable list. */
export function holdsSamples(invoice: { kind: InvoiceKind; status: InvoiceStatus }): boolean {
  return invoice.kind === "FACTURE" && SAMPLE_HOLDING_STATUSES.includes(invoice.status);
}

/**
 * The Prisma filter matching the invoice lines that hold their sample — the
 * one billing rule (CLIENTS-FUSION.md §4: a sample is billed once, to one
 * client). Billable samples are `invoiceItems: { none: holdingInvoiceItemWhere() }`;
 * `exceptInvoiceId` ignores the draft being edited or issued.
 */
export function holdingInvoiceItemWhere(exceptInvoiceId?: string): Prisma.InvoiceItemWhereInput {
  return {
    invoice: {
      is: {
        kind: "FACTURE",
        status: { in: [...SAMPLE_HOLDING_STATUSES] },
        ...(exceptInvoiceId ? { id: { not: exceptInvoiceId } } : {}),
      },
    },
  };
}

/** A typed invoice line, cleaned: centimes, trimmed, the sample it bills if any. */
export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sampleId: string | null;
};

export type InvoiceLinesCheck = { ok: true; lines: InvoiceLine[] } | { ok: false; error: string };

const DESCRIPTION_MAX = 191;

const asLineNumber = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.replace(",", "."))
      : Number.NaN;

const tooLong = (description: string) =>
  `Désignation trop longue (191 caractères max) : « ${description.slice(0, 40)}… ».`;

/**
 * The lines of an invoice as typed: blank descriptions are dropped, every
 * other line needs a quantity above zero and a price of zero or more, within
 * bounds; at least one line remains. Prices are rounded to the centime.
 *
 * `issue`: a line billing an analysis at 0 consumes the sample for good —
 * the catalogue price is missing (the screen badges « prix à saisir ») and a
 * silent zero would never be noticed. A draft may keep it; issuing may not.
 */
export function checkInvoiceLines(items: unknown, options: { issue: boolean }): InvoiceLinesCheck {
  if (items !== undefined && items !== null && !Array.isArray(items)) {
    return { ok: false, error: "Les lignes de la facture sont invalides." };
  }
  const lines: InvoiceLine[] = [];
  for (const raw of (items ?? []) as unknown[]) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) continue;
    if (description.length > DESCRIPTION_MAX) return { ok: false, error: tooLong(description) };
    const quantity = asLineNumber(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: `Quantité invalide pour « ${description} ».` };
    }
    const price = asLineNumber(item.unitPrice ?? 0);
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: `Prix unitaire invalide pour « ${description} ».` };
    }
    const unitPrice = roundMoney(price);
    if (quantity > 100000 || unitPrice > 10000000) {
      return { ok: false, error: `Montant hors limites pour « ${description} ».` };
    }
    const sampleId = typeof item.sampleId === "string" && item.sampleId ? item.sampleId : null;
    if (sampleId && options.issue && unitPrice <= 0) {
      return { ok: false, error: unpricedLineError(description) };
    }
    lines.push({
      description,
      quantity,
      unitPrice,
      // The same rounding as computeInvoiceTotals: the stored line adds up
      // to the stored total.
      lineTotal: roundMoney(quantity * unitPrice),
      sampleId,
    });
  }
  if (lines.length === 0) {
    return { ok: false, error: "Ajoutez au moins une ligne de prestation valide." };
  }
  return { ok: true, lines };
}

function unpricedLineError(description: string) {
  return `Tarif manquant pour « ${description} ». Saisissez le prix de cette analyse (ou complétez le catalogue) avant d'émettre la facture.`;
}

/**
 * Issuing a draft: the first line still billing an analysis at 0, as the
 * French refusal — or null when every analysis line has its price.
 */
export function unpricedLineRefusal(
  lines: readonly { description: string; unitPrice: MoneyInput; sampleId: string | null }[]
): string | null {
  const unpriced = lines.find((line) => line.sampleId && toMoney(line.unitPrice) <= 0);
  return unpriced ? unpricedLineError(unpriced.description) : null;
}

/** VAT is a percentage: clamped to 0–100, rounded to two decimals. */
export function cleanTaxRate(value: unknown): number {
  const rate = Number(value);
  return roundMoney(Math.min(100, Math.max(0, Number.isFinite(rate) ? rate : 0)));
}

/** What an invoice is worth once its settlements and credit notes are counted. */
export type InvoiceAmounts = {
  /** Sum of the settlements. */
  paidAmount: number;
  /** Sum of the credit notes issued against it. */
  creditedAmount: number;
  /** Reste à payer — 0 for a draft, a cancelled invoice or a credit note. */
  balance: number;
  /** What a new credit note may still take — 0 unless an issued, non-cancelled invoice. */
  remainingCreditable: number;
  state: InvoiceState;
};

const sumCents = (values: readonly MoneyInput[]) =>
  values.reduce<number>((sum, value) => sum + Math.round(toMoney(value) * 100), 0);

const isOpenInvoice = (invoice: { kind: InvoiceKind; status: InvoiceStatus }) =>
  invoice.kind === "FACTURE" && (invoice.status === "EN_ATTENTE" || invoice.status === "PAYEE");

export function invoiceAmounts(invoice: {
  kind: InvoiceKind;
  status: InvoiceStatus;
  total: MoneyInput;
  payments: readonly MoneyInput[];
  creditNotes: readonly MoneyInput[];
}): InvoiceAmounts {
  const paidAmount = sumCents(invoice.payments) / 100;
  const creditedAmount = sumCents(invoice.creditNotes) / 100;
  const open = isOpenInvoice(invoice);
  return {
    paidAmount,
    creditedAmount,
    balance: open ? balance(invoice.total, paidAmount, creditedAmount) : 0,
    remainingCreditable: open ? remainingCreditable(invoice.total, creditedAmount) : 0,
    state: invoiceState({
      status: invoice.status,
      kind: invoice.kind,
      total: invoice.total,
      paid: paidAmount,
      credited: creditedAmount,
    }),
  };
}

/** What the invoice sheet may offer, decided once for the screen and the routes. */
export type InvoiceActions = {
  canEdit: boolean;
  canDelete: boolean;
  canIssue: boolean;
  canCancel: boolean;
  canCreditNote: boolean;
  canRecordPayment: boolean;
};

export function invoiceActions(
  invoice: { kind: InvoiceKind; status: InvoiceStatus },
  amounts: Pick<InvoiceAmounts, "balance" | "remainingCreditable" | "creditedAmount">,
  paymentsCount: number
): InvoiceActions {
  const draft = canEditDraft(invoice);
  const open = isOpenInvoice(invoice);
  return {
    canEdit: draft,
    canDelete: draft,
    canIssue: canIssue(invoice),
    canCancel: canCancel({ ...invoice, credited: amounts.creditedAmount }, paymentsCount),
    canCreditNote: open && amounts.remainingCreditable > 0,
    canRecordPayment: open && amounts.balance > 0,
  };
}

/** Why a settlement may not be recorded on (or removed from) this invoice — or null. */
export function paymentRefusal(invoice: { kind: InvoiceKind; status: InvoiceStatus }): string | null {
  if (invoice.kind === "AVOIR") return "Un avoir ne reçoit pas de règlement.";
  if (invoice.status === "BROUILLON") return "Émettez la facture avant d'enregistrer un règlement.";
  if (invoice.status === "ANNULEE") return "Cette facture est annulée : elle ne reçoit plus de règlement.";
  return null;
}

/** Why a credit note may not be issued against this invoice — or null. */
export function creditNoteRefusal(invoice: { kind: InvoiceKind; status: InvoiceStatus }): string | null {
  if (invoice.kind === "AVOIR") return "Un avoir se rapporte à une facture, pas à un autre avoir.";
  if (invoice.status === "BROUILLON") return "Un brouillon ne reçoit pas d'avoir : modifiez-le directement.";
  if (invoice.status === "ANNULEE") return "Cette facture est annulée : elle ne reçoit pas d'avoir.";
  return null;
}

/**
 * The lines of a credit note as typed, cleaned like an invoice's (centimes,
 * trimmed, blank descriptions dropped); `checkCreditNote` (invoice-lifecycle)
 * then judges them. Never a sample: a credit note does not make a sample
 * billable again (FACTURATION.md §2).
 */
export function cleanCreditNoteLines(
  items: unknown
): { ok: true; lines: CreditNoteLine[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: "Un avoir comporte au moins une ligne." };
  const lines: CreditNoteLine[] = [];
  for (const raw of items as unknown[]) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) continue;
    if (description.length > DESCRIPTION_MAX) return { ok: false, error: tooLong(description) };
    const quantity = asLineNumber(item.quantity);
    const price = asLineNumber(item.unitPrice ?? 0);
    if (quantity > 100000 || price > 10000000) {
      return { ok: false, error: `Montant hors limites pour « ${description} ».` };
    }
    lines.push({
      description,
      quantity,
      unitPrice: Number.isFinite(price) ? roundMoney(price) : price,
      invoiceItemId:
        typeof item.invoiceItemId === "string" && item.invoiceItemId ? item.invoiceItemId : null,
    });
  }
  return { ok: true, lines };
}

/**
 * A credit-note line taken back from an invoice line: that line must belong
 * to the credited invoice, and its quantity and price may be reduced, never
 * raised. A free line (no `invoiceItemId`) is bounded by the total only.
 */
export function creditNoteLinesRefusal(
  lines: readonly CreditNoteLine[],
  invoiceItems: readonly { id: string; quantity: number; unitPrice: MoneyInput }[]
): string | null {
  for (const [index, line] of lines.entries()) {
    if (!line.invoiceItemId) continue;
    const item = invoiceItems.find((candidate) => candidate.id === line.invoiceItemId);
    const position = `Ligne ${index + 1}`;
    if (!item) return `${position} : la ligne reprise n'appartient pas à cette facture.`;
    if (line.quantity > item.quantity) {
      return `${position} : la quantité reprise (${line.quantity}) dépasse celle de la facture (${item.quantity}).`;
    }
    if (Math.round(line.unitPrice * 100) > Math.round(toMoney(item.unitPrice) * 100)) {
      return `${position} : le prix repris dépasse celui de la facture (${formatCurrency(toMoney(item.unitPrice))}).`;
    }
  }
  return null;
}

/**
 * The date a settlement was received, as the accountant typed it
 * (« AAAA-MM-JJ » or a full ISO time). Never after today — compared by the
 * laboratory's calendar day — and never before 2000.
 */
export function parsePaidAt(
  value: unknown,
  now: Date = new Date()
): { ok: true; date: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Indiquez la date du règlement." };
  }
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) {
    return { ok: false, error: "Date du règlement invalide." };
  }
  if (formatIsoDay(date) > formatIsoDay(now)) {
    return { ok: false, error: "La date du règlement est dans le futur." };
  }
  return { ok: true, date };
}

/**
 * True when a write lost a lock race rather than failed: MySQL chose it as
 * the victim of a deadlock (1213), it waited too long for a row lock (1205),
 * or the interactive transaction ran out of time behind one (P2028). Two
 * accountants writing on drafts that share a sample can deadlock (each holds
 * the row the other reads); the request is then refused with a 409 asking to
 * try again — nothing was written — rather than a bare 500.
 */
export function isLockConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, meta, message } = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (code === "P2034" || code === "P2028") return true;
  if (meta && (String(meta.code) === "1213" || String(meta.code) === "1205")) return true;
  return typeof message === "string" && /deadlock found|lock wait timeout exceeded/i.test(message);
}

/** The refusal shown when a write lost a lock race (`isLockConflict`). */
export const LOCK_CONFLICT_MESSAGE =
  "Une autre opération sur cette facture ou ses échantillons était en cours. Rien n'a été enregistré : réessayez.";
