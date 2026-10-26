import { MAX_AMOUNT, toMoney, type MoneyInput } from "./money";
import { computeInvoiceTotals, roundMoney } from "./invoice-math";
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

/** The invoice holding a sample (`holdingInvoiceItemWhere`): a draft (no number yet) or an issued invoice. */
export type HeldInvoice = { invoiceId: string; number: string | null };

/**
 * What a screen is told of the invoice holding a sample (`heldInvoiceFor`,
 * price-access.ts): whether it is issued — a draft otherwise — and its
 * number, null for a draft and for an issued invoice shown to a role that
 * does not see the billing (the owner's rule of 25/10).
 */
export type InvoiceFact = { number: string | null; issued: boolean };

/** « FAC-2026-00012 », or « brouillon » for a draft — as the journal and the billing roles' screens write it. */
export function heldInvoiceLabel(held: Pick<HeldInvoice, "number">): string {
  return held.number ?? "brouillon";
}

/**
 * Whether a change of a sample's analyses reaches its invoice: one line per
 * analysis, priced by the sample's category (`proposeLines`) — so the list
 * of analyses or the category changed. n, the family and the rest do not.
 */
export function billedAnalysesChanged(
  before: { parameterIds: readonly string[]; type: SampleType },
  after: { parameterIds: readonly string[]; type: SampleType }
): boolean {
  if (before.type !== after.type) return true;
  const kept = new Set(before.parameterIds);
  return after.parameterIds.length !== kept.size || after.parameterIds.some((id) => !kept.has(id));
}

/**
 * What the screen says once the analyses of a sample an invoice holds have
 * changed (16/10: F6 on the programme, F8 and C5 at the bench): the invoice
 * still bills the former list, so the accountant is told — the invoice
 * sheet says it too (« Analyses modifiées après facturation »). An issued
 * invoice told without its number (a role outside the billing, 25/10)
 * keeps the warning, neither the number nor what the accountant will do.
 */
export function billedAnalysesNotice(held: InvoiceFact): string {
  if (!held.issued) {
    return "Échantillon sur un brouillon de facture : prévenez la comptabilité — ses lignes sont à corriger avant l'émission.";
  }
  return held.number === null
    ? "Échantillon déjà facturé : prévenez la comptabilité."
    : `Échantillon déjà facturé (${held.number}) : prévenez la comptabilité — avoir pour une analyse retirée, facture complémentaire pour une analyse ajoutée.`;
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
    // Each bound alone still allows 100 000 × 10 000 000: the line must also
    // fit its DECIMAL(12,2) column (a typing slip, refused, never a 500).
    if (quantity > 100000 || unitPrice > 10000000 || roundMoney(quantity * unitPrice) > MAX_AMOUNT) {
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

/**
 * The invoice as a whole — HT, VAT and TTC — must fit its DECIMAL(12,2)
 * columns: lines each within bounds may still add up beyond them. The
 * French refusal, or null.
 */
export function invoiceTotalRefusal(lines: readonly { quantity: number; unitPrice: number }[], taxRate: number): string | null {
  const { total } = computeInvoiceTotals([...lines], taxRate);
  if (total <= MAX_AMOUNT) return null;
  return `Le total de la facture (${formatCurrency(total)}) dépasse le montant maximal accepté (${formatCurrency(MAX_AMOUNT)}) : vérifiez les quantités et les prix.`;
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

/**
 * Why a VAT rate sent for a draft is refused — or null. A rate is a number
 * from 0 to 100 (« 7 », « 5,5 »); anything else was silently stored as 0 %
 * or clamped to 100 %, so an invoice could be issued at another rate than
 * the one the accountant typed and saw in the preview.
 */
export function taxRateRefusal(value: unknown): string | null {
  const rate = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim().replace(",", ".")) : NaN;
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? null : "Le taux de TVA doit être un nombre de 0 à 100 %.";
}

/** VAT is a percentage: clamped to 0–100, rounded to two decimals. */
export function cleanTaxRate(value: unknown): number {
  const rate = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
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

/** An amount in whole centimes, so that sums never drift. */
const toCents = (value: MoneyInput) => Math.round(toMoney(value) * 100);

/**
 * What the credit notes already took back from each invoice line (HT), keyed
 * by the line's id — from the AVOIR lines linked to it (`creditedItemId`).
 * Rows with no linked line (a free line, or a credit note issued before the
 * link existed) count for nothing here: the invoice's total still bounds them.
 */
export function creditedByItem(
  rows: readonly { creditedItemId: string | null; amount: MoneyInput | null }[]
): Record<string, number> {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (!row.creditedItemId || row.amount === null) continue;
    sums.set(row.creditedItemId, (sums.get(row.creditedItemId) ?? 0) + toCents(row.amount));
  }
  return Object.fromEntries(Array.from(sums, ([id, total]) => [id, roundMoney(total / 100)]));
}

/** What may still be taken back from one invoice line (HT): its total less what was credited, never negative. */
export function remainingLineCreditable(lineTotal: MoneyInput, alreadyCredited: MoneyInput = 0): number {
  return roundMoney(Math.max(0, toCents(lineTotal) - toCents(alreadyCredited)) / 100);
}

/**
 * A credit-note line taken back from an invoice line: that line must belong
 * to the credited invoice, and its quantity and price may be reduced, never
 * raised. Across every credit note, what is taken back from one line —
 * Σ quantity × price, HT, compared in centimes — never exceeds that line's
 * total: `alreadyCredited` holds what earlier credit notes took back
 * (`creditedByItem`), and two lines of this credit note taking back the same
 * invoice line add up. A free line (no `invoiceItemId`) is bounded by the
 * invoice's total only.
 */
export function creditNoteLinesRefusal(
  lines: readonly CreditNoteLine[],
  invoiceItems: readonly {
    id: string;
    description?: string;
    quantity: number;
    unitPrice: MoneyInput;
    lineTotal: MoneyInput;
  }[],
  alreadyCredited: Readonly<Record<string, MoneyInput>> = {}
): string | null {
  const takenBack = new Map<string, number>();
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
    const amount = toCents(roundMoney(line.quantity * line.unitPrice));
    if (!Number.isFinite(amount)) continue;
    const inThisNote = takenBack.get(item.id) ?? 0;
    const before = toCents(alreadyCredited[item.id] ?? 0) + inThisNote;
    const cap = toCents(item.lineTotal);
    if (before + amount > cap) {
      const name = item.description ? `la ligne « ${item.description} »` : "cette ligne de la facture";
      if (before >= cap) return `${position} : ${name} est déjà entièrement reprise par un avoir.`;
      return (
        `${position} : la reprise (${formatCurrency(amount / 100)} HT) dépasse ce qui reste à reprendre sur ${name} ` +
        `(${formatCurrency((cap - before) / 100)} HT ; déjà repris : ${formatCurrency(before / 100)} HT).`
      );
    }
    takenBack.set(item.id, inThisNote + amount);
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
  // The days compare as « AAAA-MM-JJ » strings, which a five-digit year
  // (« +010000-01-01 ») sorted before today: it reached the column (a 500).
  if (formatIsoDay(date) > formatIsoDay(now) || date.getUTCFullYear() > now.getUTCFullYear()) {
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

/** How many times a write that lost a lock race (`isLockConflict`) runs before the 409. */
export const LOCK_RETRIES = 5;

/**
 * The pause (ms) before running a write again after a lock race: growing,
 * and jittered — requests that deadlocked together and paused alike met
 * again on every round (four clients created at once: one refused).
 */
export function lockRetryPause(attempt: number, random: () => number = Math.random): number {
  return 40 * attempt + Math.floor(random() * 80);
}

/** The refusal shown when a write lost a lock race (`isLockConflict`). */
export const LOCK_CONFLICT_MESSAGE =
  "Une autre opération sur cette facture ou ses échantillons était en cours. Rien n'a été enregistré : réessayez.";
