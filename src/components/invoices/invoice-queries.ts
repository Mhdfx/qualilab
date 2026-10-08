import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import {
  invoiceFigures,
  matchesListFilter,
  netBilled,
  stateFilterWhere,
  type InvoiceDetailView,
  type InvoiceListRow,
  type ListFilters,
} from "./invoice-view";

/**
 * The reads of the invoice screens (FACTURATION.md §4–5), shared by the
 * comptable's and the admin's pages and by the client fiche. Server only:
 * the pages hand the shaped rows to the client components.
 */

const billedSample = {
  select: {
    id: true,
    code: true,
    controlCode: true,
    status: true,
    // A sample reopened for amendment is not « facturé avant résultat ».
    report: { select: { amendmentPending: true } },
  },
} as const;

/** One invoice with everything its fiche shows, or null. */
export async function loadInvoiceDetail(id: string): Promise<InvoiceDetailView | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      // The billed sample's status: « Facturé avant résultat » and
      // « Échantillon annulé après facturation » (PROGRAMME.md §6).
      items: { include: { sample: billedSample } },
      payments: {
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        include: { createdBy: { select: { name: true } } },
      },
      creditedInvoice: { select: { id: true, number: true, issueDate: true, total: true } },
      creditNotes: {
        where: { kind: "AVOIR" },
        orderBy: { createdAt: "asc" },
        select: { id: true, number: true, issueDate: true, total: true },
      },
    },
  });
  if (!invoice) return null;

  const figures = invoiceFigures({
    status: invoice.status,
    kind: invoice.kind,
    total: invoice.total,
    payments: invoice.payments.map((payment) => payment.amount),
    creditNotes: invoice.creditNotes.map((note) => note.total),
  });

  return {
    id: invoice.id,
    number: invoice.number,
    kind: invoice.kind,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    notes: invoice.notes,
    taxRate: toMoney(invoice.taxRate),
    subtotal: toMoney(invoice.subtotal),
    taxAmount: toMoney(invoice.taxAmount),
    total: toMoney(invoice.total),
    client: {
      id: invoice.client.id,
      name: invoice.client.name,
      contact: invoice.client.contact,
      email: invoice.client.email,
      phone: invoice.client.phone,
      address: invoice.client.address,
      ice: invoice.client.ice,
    },
    createdBy: invoice.createdBy?.name ?? null,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: toMoney(item.unitPrice),
      lineTotal: toMoney(item.lineTotal),
      sampleId: item.sampleId,
      sample: item.sample
        ? {
            id: item.sample.id,
            code: item.sample.code,
            controlCode: item.sample.controlCode,
            status: item.sample.status,
            amendmentPending: item.sample.report?.amendmentPending === true,
          }
        : null,
    })),
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelledBy: invoice.cancelledBy?.name ?? null,
    cancelReason: invoice.cancelReason,
    creditedInvoice: invoice.creditedInvoice
      ? {
          id: invoice.creditedInvoice.id,
          number: invoice.creditedInvoice.number,
          issueDate: invoice.creditedInvoice.issueDate.toISOString(),
          total: toMoney(invoice.creditedInvoice.total),
        }
      : null,
    creditNotes: invoice.creditNotes.map((note) => ({
      id: note.id,
      number: note.number,
      issueDate: note.issueDate.toISOString(),
      total: toMoney(note.total),
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: toMoney(payment.amount),
      mode: payment.mode,
      paidAt: payment.paidAt.toISOString(),
      reference: payment.reference,
      note: payment.note,
      createdBy: payment.createdBy?.name ?? null,
    })),
    paidAmount: figures.paid,
    creditedAmount: figures.credited,
    balance: figures.balance,
    remainingCreditable: figures.remainingCreditable,
    state: figures.state,
  };
}

/**
 * The most recent invoices matching the filters, newest first. `etat` may
 * be an exact state or a group (`A_REGLER`, `EMISES`, `AVEC_REGLEMENT`):
 * the database narrows on the stored columns, then each row's state read
 * from its amounts decides (`matchesListFilter`).
 */
export async function loadInvoiceList(
  filters: ListFilters,
  take = 100
): Promise<{ rows: InvoiceListRow[]; truncated: boolean }> {
  // AND-ed, never spread: a group (EMISES) and the search each carry an OR.
  // A type that contradicts the filter (an « À régler » credit note) simply
  // matches nothing.
  const and: Prisma.InvoiceWhereInput[] = [
    stateFilterWhere(filters.state),
    ...(filters.kind ? [{ kind: filters.kind }] : []),
    ...(filters.q
      ? [
          {
            OR: [
              { number: { contains: filters.q } },
              { client: { name: { contains: filters.q } } },
            ],
          },
        ]
      : []),
  ].filter((part) => Object.keys(part).length > 0);
  const where: Prisma.InvoiceWhereInput = and.length > 0 ? { AND: and } : {};

  const found = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      issueDate: true,
      total: true,
      client: { select: { id: true, name: true } },
      creditedInvoice: { select: { id: true, number: true } },
      payments: { select: { amount: true } },
      creditNotes: { where: { kind: "AVOIR" }, select: { total: true } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });

  const truncated = found.length > take;
  const rows = found.slice(0, take).flatMap((invoice): InvoiceListRow[] => {
    const figures = invoiceFigures({
      status: invoice.status,
      kind: invoice.kind,
      total: invoice.total,
      payments: invoice.payments.map((payment) => payment.amount),
      creditNotes: invoice.creditNotes.map((note) => note.total),
    });
    // « Émise » and « Partiellement payée » share a stored status: the
    // exact state is read from the amounts.
    if (!matchesListFilter(figures.state, filters.state)) return [];
    const open = figures.state === "EMISE" || figures.state === "PARTIELLEMENT_PAYEE" || figures.state === "PAYEE";
    return [
      {
        id: invoice.id,
        number: invoice.number,
        kind: invoice.kind,
        status: invoice.status,
        issueDate: invoice.issueDate.toISOString(),
        total: toMoney(invoice.total),
        client: invoice.client,
        creditedInvoice: invoice.creditedInvoice,
        balance: open ? figures.balance : null,
        state: figures.state,
      },
    ];
  });
  return { rows, truncated };
}

export type BillingFigures = {
  /** Issued invoices, not cancelled (count). */
  issuedCount: number;
  /** Issued this month, not cancelled (count). */
  issuedThisMonth: number;
  draftCount: number;
  cancelledCount: number;
  creditNoteCount: number;
  /** Issued invoices still waiting for money, partly paid included (count). */
  awaitingCount: number;
  /** Chiffre facturé: issued, not cancelled, less the credit notes. */
  billed: number;
  /** Sum of the settlements. */
  collected: number;
  /** Sum of what is left to pay on the issued invoices. */
  outstanding: number;
};

/**
 * The headline figures (FACTURATION.md §4): drafts and cancelled invoices
 * apart, billed = issued − credit notes, collected = settlements. Over every
 * invoice, or one client's.
 */
export async function billingFigures(scope: { clientId?: string } = {}): Promise<BillingFigures> {
  const client = scope.clientId ? { clientId: scope.clientId } : {};
  const issuedWhere: Prisma.InvoiceWhereInput = {
    ...client,
    kind: "FACTURE",
    status: { in: ["EN_ATTENTE", "PAYEE"] },
  };
  const creditWhere: Prisma.InvoiceWhereInput = {
    ...client,
    kind: "AVOIR",
    status: { notIn: ["BROUILLON", "ANNULEE"] },
  };
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [issued, credits, issuedThisMonth, draftCount, cancelledCount, payments, open] = await Promise.all([
    prisma.invoice.aggregate({ where: issuedWhere, _sum: { total: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: creditWhere, _sum: { total: true }, _count: { _all: true } }),
    prisma.invoice.count({ where: { ...issuedWhere, issueDate: { gte: startOfMonth } } }),
    prisma.invoice.count({ where: { ...client, kind: "FACTURE", status: "BROUILLON" } }),
    prisma.invoice.count({ where: { ...client, kind: "FACTURE", status: "ANNULEE" } }),
    prisma.payment.aggregate({
      where: scope.clientId ? { invoice: { clientId: scope.clientId } } : {},
      _sum: { amount: true },
    }),
    // What is left to pay is per invoice (never negative), so it is read on
    // the open invoices rather than from a difference of global sums.
    prisma.invoice.findMany({
      where: { ...client, kind: "FACTURE", status: "EN_ATTENTE" },
      select: {
        status: true,
        kind: true,
        total: true,
        payments: { select: { amount: true } },
        creditNotes: { where: { kind: "AVOIR" }, select: { total: true } },
      },
    }),
  ]);

  let outstandingCents = 0;
  let awaitingCount = 0;
  for (const invoice of open) {
    const figures = invoiceFigures({
      status: invoice.status,
      kind: invoice.kind,
      total: invoice.total,
      payments: invoice.payments.map((payment) => payment.amount),
      creditNotes: invoice.creditNotes.map((note) => note.total),
    });
    if (figures.balance > 0) awaitingCount += 1;
    outstandingCents += Math.round(figures.balance * 100);
  }

  return {
    issuedCount: issued._count._all,
    issuedThisMonth,
    draftCount,
    cancelledCount,
    creditNoteCount: credits._count._all,
    awaitingCount,
    billed: netBilled(issued._sum.total, credits._sum.total),
    collected: toMoney(payments._sum.amount),
    outstanding: outstandingCents / 100,
  };
}
