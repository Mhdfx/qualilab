import type { InvoiceKind, InvoiceStatus, PaymentMode } from "@/generated/prisma/enums";
import type { BilledSample } from "@/lib/invoice-notices";
import { computeInvoiceTotals, type InvoiceTotals } from "@/lib/invoice-math";
import {
  balance,
  cancelRefusal,
  canEditDraft,
  checkCreditNote,
  INVOICE_STATE_LABELS,
  invoiceState,
  isIssued,
  remainingCreditable,
  type CreditNoteLine,
  type InvoiceState,
} from "@/lib/invoice-lifecycle";
import { toMoney, type MoneyInput } from "@/lib/money";

/**
 * What the invoice screens show (FACTURATION.md §5), shaped once.
 *
 * Pure and client-safe: the server pages load the rows, the client
 * components render them, and both read the same rules from
 * `invoice-lifecycle` — so the fiche, the list and the figures never
 * disagree on what an invoice reads as or on what is left to pay.
 */

// ---------------------------------------------------------------------------
// Shapes crossing from the server pages to the client components
// ---------------------------------------------------------------------------

export type InvoiceViewClient = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
};

export type InvoiceViewItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sampleId: string | null;
  /** The billed sample's status (PROGRAMME.md §6 banners); absent on a line typed by hand. */
  sample?: BilledSample | null;
};

export type PaymentView = {
  id: string;
  amount: number;
  mode: PaymentMode;
  /** ISO date. */
  paidAt: string;
  reference: string | null;
  note: string | null;
  createdBy: string | null;
};

export type LinkedInvoice = {
  id: string;
  number: string | null;
  /** ISO date printed on the document. */
  issueDate: string;
  total: number;
};

export type InvoiceDetailView = {
  id: string;
  /** Null while a draft. */
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: string;
  issuedAt: string | null;
  dueDate: string | null;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  client: InvoiceViewClient;
  createdBy: string | null;
  items: InvoiceViewItem[];
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  /** AVOIR: the invoice it corrects. */
  creditedInvoice: LinkedInvoice | null;
  /** FACTURE: the credit notes issued against it. */
  creditNotes: LinkedInvoice[];
  payments: PaymentView[];
  paidAmount: number;
  creditedAmount: number;
  balance: number;
  remainingCreditable: number;
  state: InvoiceState;
};

export type InvoiceListRow = {
  id: string;
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: string;
  total: number;
  client: { id: string; name: string };
  creditedInvoice: { id: string; number: string | null } | null;
  /** Null for a draft, a cancelled invoice or a credit note: nothing to collect. */
  balance: number | null;
  state: InvoiceState;
};

/** A draft as the invoice form re-opens it (« Modifier »). */
export type DraftFormInvoice = {
  id: string;
  clientId: string;
  clientName: string;
  /** `YYYY-MM-DD`, or null. */
  dueDate: string | null;
  taxRate: number;
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; sampleId: string | null }[];
};

/** The draft form's starting values, from the fiche's view of a draft. */
export function draftFormInvoice(invoice: InvoiceDetailView): DraftFormInvoice {
  return {
    id: invoice.id,
    clientId: invoice.client.id,
    clientName: invoice.client.name,
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : null,
    taxRate: invoice.taxRate,
    notes: invoice.notes,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      sampleId: item.sampleId,
    })),
  };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const sum = (values: MoneyInput[]) =>
  Math.round(values.reduce<number>((total, value) => total + Math.round(toMoney(value) * 100), 0)) / 100;

/** Sums settlement or credit-note amounts in centimes. */
export function sumAmounts(values: MoneyInput[]): number {
  return sum(values);
}

/**
 * Amount, settled, credited, left to pay and state of one invoice from its
 * stored total, settlements and credit notes.
 */
export function invoiceFigures(input: {
  status: InvoiceStatus;
  kind: InvoiceKind;
  total: MoneyInput;
  payments: MoneyInput[];
  creditNotes: MoneyInput[];
}) {
  const paid = sum(input.payments);
  const credited = sum(input.creditNotes);
  const state = invoiceState({
    status: input.status,
    kind: input.kind,
    total: input.total,
    paid,
    credited,
  });
  // Same contract as the API (lib/billing.ts invoiceAmounts): only an issued
  // invoice that is not cancelled has something to pay or to credit — a
  // draft, a cancelled invoice and a credit note read 0, never their total.
  const open = input.kind === "FACTURE" && (input.status === "EN_ATTENTE" || input.status === "PAYEE");
  return {
    paid,
    credited,
    balance: open ? balance(input.total, paid, credited) : 0,
    remainingCreditable: open ? remainingCreditable(input.total, credited) : 0,
    state,
  };
}

/** Whether « Reste à payer » means anything for this invoice. */
export function collectable(state: InvoiceState): boolean {
  return state === "EMISE" || state === "PARTIELLEMENT_PAYEE" || state === "PAYEE";
}

/**
 * Chiffre facturé (FACTURATION.md §4): issued invoices that are not
 * cancelled, less the credit notes. Never negative.
 */
export function netBilled(issuedTotal: MoneyInput, creditNotesTotal: MoneyInput): number {
  return Math.max(0, Math.round(toMoney(issuedTotal) * 100) - Math.round(toMoney(creditNotesTotal) * 100)) / 100;
}

// ---------------------------------------------------------------------------
// The actions the fiche offers
// ---------------------------------------------------------------------------

export type InvoiceActionSet = {
  edit: boolean;
  issue: boolean;
  deleteDraft: boolean;
  recordPayment: boolean;
  creditNote: boolean;
  /** Shown on an issued invoice; disabled with `cancelBlockedBy` when refused. */
  cancel: boolean;
  cancelBlockedBy: string | null;
  deletePayment: boolean;
};

const NONE: InvoiceActionSet = {
  edit: false,
  issue: false,
  deleteDraft: false,
  recordPayment: false,
  creditNote: false,
  cancel: false,
  cancelBlockedBy: null,
  deletePayment: false,
};

/**
 * The buttons of an invoice for someone allowed to manage invoices
 * (COMPTABLE, ADMIN). The API decides again; this only spares a click that
 * would be refused.
 */
export function invoiceActions(
  invoice: Pick<InvoiceDetailView, "status" | "kind" | "balance" | "remainingCreditable" | "creditedAmount"> & {
    payments: readonly unknown[];
  },
  canManage: boolean
): InvoiceActionSet {
  if (!canManage) return NONE;
  if (canEditDraft(invoice)) {
    return { ...NONE, edit: true, issue: true, deleteDraft: true };
  }
  if (invoice.kind === "AVOIR" || !isIssued(invoice) || invoice.status === "ANNULEE") return NONE;
  return {
    ...NONE,
    recordPayment: invoice.balance > 0,
    creditNote: invoice.remainingCreditable > 0,
    cancel: true,
    cancelBlockedBy: cancelRefusal(
      { status: invoice.status, kind: invoice.kind, credited: invoice.creditedAmount },
      invoice.payments.length
    ),
    deletePayment: invoice.payments.length > 0,
  };
}

/** The badge colours of each state — same palette as the rest of the app. */
export const INVOICE_STATE_TONES: Record<InvoiceState, string> = {
  BROUILLON: "bg-slate-100 text-slate-700 ring-slate-300",
  EMISE: "bg-sky-50 text-sky-800 ring-sky-200",
  PARTIELLEMENT_PAYEE: "bg-amber-50 text-amber-800 ring-amber-200",
  PAYEE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ANNULEE: "bg-rose-50 text-rose-700 ring-rose-200",
  AVOIR: "bg-violet-50 text-violet-800 ring-violet-200",
};

/** How a document is referred to: its number, or « Brouillon » while it has none. */
export function documentLabel(invoice: { number: string | null; kind: InvoiceKind }): string {
  if (invoice.number) return invoice.number;
  return invoice.kind === "AVOIR" ? "Avoir sans numéro" : "Brouillon";
}

// ---------------------------------------------------------------------------
// The list filters
// ---------------------------------------------------------------------------

/** The states offered by the list filter; credit notes are picked by type. */
export const LIST_STATE_FILTERS = [
  "BROUILLON",
  "EMISE",
  "PARTIELLEMENT_PAYEE",
  "PAYEE",
  "ANNULEE",
] as const satisfies readonly InvoiceState[];
export type ListStateFilter = (typeof LIST_STATE_FILTERS)[number];

/**
 * Groups of documents a dashboard figure is made of (« comme un tri »), on
 * top of the exact states. They are not states — an invoice reads as one
 * state, but belongs to several groups — so they stay out of
 * `LIST_STATE_FILTERS`; the list's `?etat=` takes either.
 *
 * - `A_REGLER` « À régler »: the issued invoices with something left to pay,
 *   i.e. « Émise » ∪ « Partiellement payée » — « Reste à payer », « En attente
 *   de règlement ».
 * - `EMISES` « Émises »: every issued document that is not cancelled,
 *   invoices and credit notes — the documents « Facturé (net d'avoirs) » is
 *   computed from (`billingFigures`); with `?type=FACTURE`, « Factures émises ».
 * - `AVEC_REGLEMENT` « Avec règlement »: the invoices that received at least
 *   one settlement — those that carry « Encaissé ».
 */
export const LIST_GROUP_FILTERS = ["A_REGLER", "EMISES", "AVEC_REGLEMENT"] as const;
export type ListGroupFilter = (typeof LIST_GROUP_FILTERS)[number];

export const LIST_GROUP_FILTER_LABELS: Record<ListGroupFilter, string> = {
  A_REGLER: "À régler",
  EMISES: "Émises",
  AVEC_REGLEMENT: "Avec règlement",
};

/** What each group holds, printed after its label (« À régler : … »). */
export const LIST_GROUP_FILTER_HINTS: Record<ListGroupFilter, string> = {
  A_REGLER: "factures émises ou partiellement payées, dont il reste un montant à encaisser.",
  EMISES: "factures et avoirs émis, hors brouillons et factures annulées.",
  AVEC_REGLEMENT: "factures ayant reçu au moins un règlement.",
};

/** What `?etat=` may hold: one exact state, or one group. */
export type ListFilter = ListStateFilter | ListGroupFilter;

export function isListGroupFilter(value: ListFilter | null): value is ListGroupFilter {
  return value !== null && (LIST_GROUP_FILTERS as readonly string[]).includes(value);
}

/** The label of a `?etat=` value, exact state or group. */
export function listFilterLabel(filter: ListFilter): string {
  return isListGroupFilter(filter) ? LIST_GROUP_FILTER_LABELS[filter] : INVOICE_STATE_LABELS[filter];
}

export const LIST_KIND_FILTERS = ["FACTURE", "AVOIR"] as const satisfies readonly InvoiceKind[];

export const LIST_KIND_FILTER_LABELS: Record<InvoiceKind, string> = {
  FACTURE: "Factures",
  AVOIR: "Avoirs",
};

export type ListFilters = {
  /** `?etat=`: an exact state or a group (`LIST_GROUP_FILTERS`). */
  state: ListFilter | null;
  kind: InvoiceKind | null;
  q: string;
};

type RawParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const LIST_FILTERS: readonly string[] = [...LIST_STATE_FILTERS, ...LIST_GROUP_FILTERS];

/** Reads `?etat=&type=&q=` — anything unknown is simply no filter. */
export function parseListFilters(params: RawParams): ListFilters {
  const state = first(params.etat);
  const kind = first(params.type);
  return {
    state: LIST_FILTERS.includes(state) ? (state as ListFilter) : null,
    kind: (LIST_KIND_FILTERS as readonly string[]).includes(kind) ? (kind as InvoiceKind) : null,
    q: first(params.q).trim().slice(0, 100),
  };
}

/** The query string of a set of filters (empty values dropped). */
export function listFiltersQuery(filters: ListFilters): string {
  const params = new URLSearchParams();
  if (filters.state) params.set("etat", filters.state);
  if (filters.kind) params.set("type", filters.kind);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The link of a filtered invoice list, for a tile or a figure:
 * `invoiceListHref("/comptabilite/factures", { state: "A_REGLER" })` →
 * `/comptabilite/factures?etat=A_REGLER`. `base` is the list of the space
 * the viewer is in — `/comptabilite/factures` (COMPTABLE, ADMIN) or
 * `/admin/factures` (ADMIN only); a client component reads it with
 * `useInvoiceBasePath()`.
 */
export function invoiceListHref(base: string, filters: Partial<ListFilters> = {}): string {
  return `${base}${listFiltersQuery({ state: null, kind: null, q: "", ...filters })}`;
}

/** Whether the list shows exactly these filters — for a tile's `active`. */
export function sameListFilters(a: ListFilters, b: Partial<ListFilters>): boolean {
  return a.state === (b.state ?? null) && a.kind === (b.kind ?? null) && a.q === (b.q ?? "");
}

/** The part of an invoice `where` a list filter sets (assignable to Prisma's `InvoiceWhereInput`). */
export type InvoiceFilterWhere = {
  kind?: InvoiceKind;
  status?: { in?: InvoiceStatus[]; notIn?: InvoiceStatus[] };
  payments?: { some: Record<string, never> };
  OR?: InvoiceFilterWhere[];
};

/**
 * The stored columns a list filter narrows to, before the exact state is
 * read from the amounts: « Émise » and « Partiellement payée » are both
 * EN_ATTENTE and differ by their settlements; « Payée » may also be an
 * EN_ATTENTE invoice fully covered by credit notes. A group may hold both
 * kinds (`EMISES`): the caller AND-s it with the type filter and the search,
 * never spreads it into a `where` that has its own `OR`.
 */
export function stateFilterWhere(state: ListFilter | null): InvoiceFilterWhere {
  switch (state) {
    case null:
      return {};
    case "A_REGLER":
      return { kind: "FACTURE", status: { in: ["EN_ATTENTE"] } };
    case "EMISES":
      // The same two sets `billingFigures` sums for « Facturé (net d'avoirs) ».
      return {
        OR: [
          { kind: "FACTURE", status: { in: ["EN_ATTENTE", "PAYEE"] } },
          { kind: "AVOIR", status: { notIn: ["BROUILLON", "ANNULEE"] } },
        ],
      };
    case "AVEC_REGLEMENT":
      return { payments: { some: {} } };
    case "BROUILLON":
      return { kind: "FACTURE", status: { in: ["BROUILLON"] } };
    case "ANNULEE":
      return { kind: "FACTURE", status: { in: ["ANNULEE"] } };
    case "PAYEE":
      return { kind: "FACTURE", status: { in: ["PAYEE", "EN_ATTENTE"] } };
    case "EMISE":
    case "PARTIELLEMENT_PAYEE":
      return { kind: "FACTURE", status: { in: ["EN_ATTENTE"] } };
  }
}

/**
 * Whether a row the database returned belongs to the filter, once its exact
 * state is read from its amounts (the second half of `stateFilterWhere`).
 */
export function matchesListFilter(state: InvoiceState, filter: ListFilter | null): boolean {
  switch (filter) {
    case null:
    case "AVEC_REGLEMENT":
      return true;
    case "A_REGLER":
      return state === "EMISE" || state === "PARTIELLEMENT_PAYEE";
    case "EMISES":
      return state === "EMISE" || state === "PARTIELLEMENT_PAYEE" || state === "PAYEE" || state === "AVOIR";
    default:
      return state === filter;
  }
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/** A typed amount (« 1 250,50 » or « 1250.5 ») as a number, NaN when unreadable. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** The settlement form's amount, pre-filled with what is left to pay. */
export function amountInput(value: number): string {
  return value > 0 ? value.toFixed(2) : "";
}

/** One line of the credit-note dialog: taken from the invoice, or free. */
export type CreditNoteDraftLine = {
  key: string;
  /** The invoice line it takes back; null for a free line. */
  invoiceItemId: string | null;
  selected: boolean;
  description: string;
  quantity: string;
  unitPrice: string;
};

/** The dialog's starting lines: every invoice line, unticked, at its quantity and price. */
export function creditNoteDraftLines(items: InvoiceViewItem[]): CreditNoteDraftLine[] {
  return items.map((item) => ({
    key: item.id,
    invoiceItemId: item.id,
    selected: false,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: item.unitPrice.toFixed(2),
  }));
}

/** The ticked lines as the API takes them (`invoiceItemId` only on a line taken back). */
export function creditNoteLines(draft: CreditNoteDraftLine[]): CreditNoteLine[] {
  return draft
    .filter((line) => line.selected)
    .map((line) => ({
      description: line.description.trim(),
      quantity: parseAmount(line.quantity),
      unitPrice: parseAmount(line.unitPrice),
      ...(line.invoiceItemId ? { invoiceItemId: line.invoiceItemId } : {}),
    }));
}

/**
 * The live preview of the dialog: totals of the readable lines, and the
 * error the API would answer, so the button says it before the click.
 */
export function creditNotePreview(
  draft: CreditNoteDraftLine[],
  remaining: number,
  taxRate: number
): { totals: InvoiceTotals; error: string | null; lines: CreditNoteLine[] } {
  const lines = creditNoteLines(draft);
  const readable = lines.filter((line) => Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice));
  const totals = computeInvoiceTotals(readable, taxRate);
  const check = checkCreditNote(lines, remaining, taxRate);
  return { totals, error: check.ok ? null : check.error, lines };
}
