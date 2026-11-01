import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMode } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { isoDayOf } from "./date-only";
import { labDayOf } from "./lab-time";
import { dueState, type DueState } from "./stock";
import { purchaseBalance, purchaseStatusLabel, isCorrectable, type PurchaseStatus, type PurchaseStatusLabel } from "./purchase-invoice";
import {
  certificateState,
  effectiveCertificateState,
  proposedWithholdingRate,
  withholdingAmountFor,
  withholdingRefusal,
  type CertificateState,
  type WithholdingBaseCode,
  type WithholdingSettings,
} from "./withholding";
import type { CleanPurchaseInvoice } from "./achat-validation";
import { purchasePeriod } from "./purchase-journal";

/**
 * The supplier invoices as the magasin reads them (lot 3D): one query
 * shape, one serialisation, shared by /magasin/factures, its API and the
 * dashboard — so the list, the totals and the alerts agree.
 */

export const PURCHASE_SUPPLIER_SELECT = {
  id: true,
  name: true,
  ice: true,
  paymentTermDays: true,
  withholdingSubject: true,
  taxCertificateDate: true,
  taxCertificateValidUntil: true,
} satisfies Prisma.SupplierSelect;

export const PURCHASE_INVOICE_INCLUDE = {
  supplier: { select: PURCHASE_SUPPLIER_SELECT },
  payments: {
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    select: { id: true, paidOn: true, amount: true, method: true, reference: true },
  },
} satisfies Prisma.PurchaseInvoiceInclude;

export type LoadedPurchaseInvoice = Prisma.PurchaseInvoiceGetPayload<{ include: typeof PURCHASE_INVOICE_INCLUDE }>;

export type PurchasePaymentView = {
  id: string;
  paidOn: string;
  amount: number;
  method: PaymentMode;
  reference: string | null;
};

/** One invoice for the screens (plain JSON). Days are « AAAA-MM-JJ ». */
export type PurchaseInvoiceView = {
  id: string;
  number: string;
  label: string | null;
  /** TTC. */
  amount: number;
  amountHT: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  currency: string | null;
  amountForeign: number | null;
  exchangeRate: number | null;
  issueDate: string;
  dueDate: string;
  issueDay: string;
  dueDay: string;
  status: PurchaseStatus;
  statusLabel: PurchaseStatusLabel;
  due: DueState;
  paidAt: string | null;
  paymentMethod: PaymentMode | null;
  paymentReference: string | null;
  taxCertificateProvided: boolean | null;
  taxCertificateDay: string | null;
  certificate: CertificateState;
  withholdingRate: number | null;
  withholdingAmount: number | null;
  net: number;
  paid: number;
  remaining: number;
  correctable: boolean;
  correctedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  payments: PurchasePaymentView[];
  supplier: { id: string; name: string };
};

const optional = (value: unknown) => (value === null || value === undefined ? null : toMoney(value as string));

/**
 * Whether a valid attestation covers the invoice (M7): covered when it was
 * recorded, or by an attestation known today valid on its day.
 */
export function invoiceCertificate(invoice: LoadedPurchaseInvoice, validityMonths: number): CertificateState {
  return effectiveCertificateState(invoice.taxCertificateState, certificateState({
    issueDate: invoice.issueDate,
    invoiceProvided: invoice.taxCertificateProvided,
    invoiceCertificateDate: invoice.taxCertificateDate,
    supplierCertificateDate: invoice.supplier.taxCertificateDate,
    supplierCertificateValidUntil: invoice.supplier.taxCertificateValidUntil,
    validityMonths,
  }));
}

export function purchaseInvoiceView(invoice: LoadedPurchaseInvoice, validityMonths: number, now = new Date()): PurchaseInvoiceView {
  const payments = invoice.payments.map((payment) => ({
    id: payment.id,
    paidOn: isoDayOf(payment.paidOn),
    amount: toMoney(payment.amount),
    method: payment.method,
    reference: payment.reference,
  }));
  const figures = {
    status: invoice.status,
    amount: toMoney(invoice.amount),
    withholdingAmount: optional(invoice.withholdingAmount),
    payments: payments.map((payment) => payment.amount),
  };
  const due: DueState = invoice.status === "A_PAYER" ? dueState(invoice.dueDate, now) : "OK";
  const { net, paid, remaining } = purchaseBalance(figures);
  return {
    id: invoice.id,
    number: invoice.number,
    label: invoice.label,
    amount: figures.amount,
    amountHT: optional(invoice.amountHT),
    vatRate: optional(invoice.vatRate),
    vatAmount: optional(invoice.vatAmount),
    currency: invoice.currency,
    amountForeign: optional(invoice.amountForeign),
    exchangeRate: invoice.exchangeRate === null ? null : Number(invoice.exchangeRate.toString()),
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    issueDay: isoDayOf(invoice.issueDate),
    dueDay: isoDayOf(invoice.dueDate),
    status: invoice.status,
    statusLabel: purchaseStatusLabel(figures, due),
    due,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    taxCertificateProvided: invoice.taxCertificateProvided,
    taxCertificateDay: invoice.taxCertificateDate ? isoDayOf(invoice.taxCertificateDate) : null,
    certificate: invoiceCertificate(invoice, validityMonths),
    withholdingRate: optional(invoice.withholdingRate),
    withholdingAmount: optional(invoice.withholdingAmount),
    net,
    paid,
    remaining,
    correctable: isCorrectable({ status: invoice.status, paymentCount: invoice.payments.length }),
    correctedAt: invoice.correctedAt?.toISOString() ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelReason: invoice.cancelReason,
    payments,
    supplier: { id: invoice.supplier.id, name: invoice.supplier.name },
  };
}

// ————— The list's filters —————

export type PurchaseListFilters = {
  /** « a_payer », « payees », « annulees », or null = every invoice but the cancelled ones. */
  view: "a_payer" | "payees" | "annulees" | null;
  supplierId: string | null;
  /** « AAAA-MM » or « AAAA ». */
  period: string | null;
  /** The invoice number, contained. */
  q: string | null;
};

const VIEWS = ["a_payer", "payees", "annulees"] as const;

export function purchaseListFilters(params: URLSearchParams): PurchaseListFilters {
  const view = params.get("vue") ?? params.get("status");
  const legacy = view === "A_PAYER" ? "a_payer" : view === "PAYEE" ? "payees" : view;
  return {
    view: (VIEWS as readonly string[]).includes(legacy ?? "") ? (legacy as PurchaseListFilters["view"]) : null,
    supplierId: params.get("fournisseur")?.trim() || null,
    period: params.get("periode")?.trim() || null,
    q: params.get("q")?.trim().slice(0, 191) || null,
  };
}

export function purchaseListWhere(filters: PurchaseListFilters): Prisma.PurchaseInvoiceWhereInput {
  const where: Prisma.PurchaseInvoiceWhereInput = {};
  if (filters.view === "a_payer") where.status = "A_PAYER";
  else if (filters.view === "payees") where.status = "PAYEE";
  else if (filters.view === "annulees") where.status = "ANNULEE";
  else where.status = { not: "ANNULEE" };
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.q) where.number = { contains: filters.q };
  if (filters.period) {
    const parsed = /^\d{4}$/.test(filters.period) ? purchasePeriod({ annee: filters.period }) : purchasePeriod({ mois: filters.period });
    if (parsed.ok && parsed.period.from && parsed.period.until) {
      where.issueDate = { gte: parsed.period.from, lt: parsed.period.until };
    }
  }
  return where;
}

export const PURCHASE_LIST_ORDER = [
  { status: "asc" },
  { dueDate: "asc" },
  { id: "asc" },
] satisfies Prisma.PurchaseInvoiceOrderByWithRelationInput[];

/** What is left to pay on the invoices of a filter (every page, not only the one shown). */
export async function purchaseListSummary(where: Prisma.PurchaseInvoiceWhereInput) {
  const [unpaid, paidCount] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { AND: [where, { status: "A_PAYER" }] },
      select: { amount: true, withholdingAmount: true, payments: { select: { amount: true } } },
    }),
    prisma.purchaseInvoice.count({ where: { AND: [where, { status: "PAYEE" }] } }),
  ]);
  const remaining = unpaid.reduce((sum, invoice) => {
    const { remaining: left } = purchaseBalance({
      status: "A_PAYER",
      amount: toMoney(invoice.amount),
      withholdingAmount: optional(invoice.withholdingAmount),
      payments: invoice.payments.map((payment) => toMoney(payment.amount)),
    });
    return sum + Math.round(left * 100);
  }, 0);
  return { unpaidCount: unpaid.length, paidCount, remaining: remaining / 100 };
}

// ————— Recording / correcting: the retenue (M7) —————

/**
 * The retenue of an invoice as typed: the rate typed, else the settings'
 * proposal (scope, supplier, attestation), and its amount on the settings'
 * base. Null rate = nothing withheld. `refusal` (French) when it cannot be
 * recorded: a rate on the HT or the TVA of a TTC-only invoice, or a retenue
 * taking the whole TTC — the routes answer 400 with it.
 */
export function withholdingFor(
  value: CleanPurchaseInvoice,
  supplier: { withholdingSubject: boolean; taxCertificateDate: Date | null; taxCertificateValidUntil: Date | null },
  settings: WithholdingSettings
): {
  rate: number | null;
  amount: number | null;
  base: WithholdingBaseCode;
  certificate: CertificateState;
  refusal: string | null;
} {
  const certificate = certificateState({
    issueDate: value.issueDate,
    invoiceProvided: value.taxCertificateProvided,
    invoiceCertificateDate: value.taxCertificateDate,
    supplierCertificateDate: supplier.taxCertificateDate,
    supplierCertificateValidUntil: supplier.taxCertificateValidUntil,
    validityMonths: settings.certificateValidityMonths,
  });
  const rate = value.withholdingRate ?? proposedWithholdingRate(settings, supplier.withholdingSubject, certificate);
  const base = settings.base;
  if (rate === null || rate === 0) return { rate: rate === 0 ? 0 : null, amount: null, base, certificate, refusal: null };
  const amounts = { ht: value.amountHT, tva: value.vatAmount, ttc: value.amount };
  const amount = withholdingAmountFor(base, rate, amounts);
  return { rate, amount, base, certificate, refusal: withholdingRefusal(base, rate, amounts) };
}

/** The columns an invoice's form writes (create and correction alike). */
export function purchaseInvoiceData(
  value: CleanPurchaseInvoice,
  withholding: { rate: number | null; amount: number | null; base: WithholdingBaseCode; certificate: CertificateState }
) {
  return {
    number: value.number,
    label: value.label,
    amount: value.amount,
    amountHT: value.amountHT,
    vatRate: value.vatRate,
    vatAmount: value.vatAmount,
    issueDate: value.issueDate,
    currency: value.currency,
    amountForeign: value.amountForeign,
    exchangeRate: value.exchangeRate,
    taxCertificateProvided: value.taxCertificateProvided,
    taxCertificateDate: value.taxCertificateDate,
    withholdingRate: withholding.rate,
    withholdingAmount: withholding.amount,
    // The base only when something is withheld; the attestation's state always (M7).
    withholdingBase: withholding.amount ? withholding.base : null,
    taxCertificateState: withholding.certificate,
  };
}

/** The lab's today « AAAA-MM-JJ ». */
export const labToday = (now = new Date()) => labDayOf(now);
