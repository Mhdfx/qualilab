import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { toMoney } from "@/lib/money";
import { serializeInvoice } from "@/lib/invoice-serialize";
import { BILLABLE_STATUSES } from "@/lib/billing-status";
import { invoiceSampleRefusal } from "@/lib/client-merge-rules";
import {
  SAMPLE_HOLDING_STATUSES,
  checkInvoiceLines,
  cleanTaxRate,
  invoiceActions,
  invoiceAmounts,
  isLockConflict,
  LOCK_CONFLICT_MESSAGE,
  type InvoiceLine,
} from "@/lib/billing";
import { INVOICE_STATE_LABELS } from "@/lib/invoice-lifecycle";

/**
 * What the invoice routes share (FACTURATION.md §1–4): reading a request,
 * locking an invoice for the length of a transaction, checking the samples a
 * draft reserves, and shaping an invoice for the wire. Server only — it is
 * never imported by a client component. The decisions themselves are pure,
 * in src/lib/billing.ts and src/lib/invoice-lifecycle.ts.
 */

/** A refusal raised inside a transaction: rolls it back, then becomes the response. */
export class InvoiceRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** The response for an error thrown by a route: the refusal as is, anything else a 500. */
export function errorResponse(error: unknown, fallback: string, context: Record<string, unknown>) {
  if (error instanceof InvoiceRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isLockConflict(error)) {
    console.warn("[invoice] lock conflict", { ...context, error });
    return NextResponse.json({ error: LOCK_CONFLICT_MESSAGE }, { status: 409 });
  }
  console.error("[invoice]", fallback, { ...context, error });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** The JSON body as an object, or the 400 to return. An empty body reads as `{}`. */
export async function readBody(request: Request): Promise<Record<string, unknown> | NextResponse> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!text.trim()) return {};
  try {
    const body = JSON.parse(text) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
}

type Tx = Prisma.TransactionClient;

/**
 * Locks the invoice row until the transaction ends, so that a draft is not
 * issued twice, a payment is not recorded on an invoice being cancelled, and
 * two credit notes cannot together exceed the invoice. Throws the 404.
 */
export async function lockInvoice(tx: Tx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT \`id\` FROM \`Invoice\` WHERE \`id\` = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new InvoiceRequestError(404, "Facture introuvable.");
}

/** The editable fields of a draft (POST /api/invoices, PATCH /api/invoices/[id]). */
export type DraftFields = {
  clientId: string;
  dueDate: Date | null;
  notes: string | null;
  taxRate: number;
  lines: InvoiceLine[];
};

/** Reads `{ clientId, items, taxRate, dueDate?, notes? }`; throws the 400. */
export function parseDraftFields(body: Record<string, unknown>, options: { issue: boolean }): DraftFields {
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) throw new InvoiceRequestError(400, "Veuillez sélectionner un client.");

  let dueDate: Date | null = null;
  if (typeof body.dueDate === "string" && body.dueDate.trim()) {
    dueDate = new Date(body.dueDate.trim());
    if (Number.isNaN(dueDate.getTime())) throw new InvoiceRequestError(400, "Date d'échéance invalide.");
  } else if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== "") {
    throw new InvoiceRequestError(400, "Date d'échéance invalide.");
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  if (notes && notes.length > 5000) throw new InvoiceRequestError(400, "Les observations sont trop longues (5 000 caractères max).");

  const checked = checkInvoiceLines(body.items, options);
  if (!checked.ok) throw new InvoiceRequestError(400, checked.error);

  return { clientId, dueDate, notes, taxRate: cleanTaxRate(body.taxRate), lines: checked.lines };
}

/**
 * The samples billed by these lines, checked against reality inside the
 * writing transaction (their rows locked, so two drafts cannot reserve the
 * same sample at the same instant):
 *  - billed to this client — its own, unless its site is billed to another
 *    client, or one of a site billed to it (CLIENTS-FUSION.md §4);
 *  - billable — programme confirmed, never cancelled (PROGRAMME.md §6);
 *  - not held by another invoice line — a draft reserves, an issued invoice
 *    bills; a cancelled invoice and a credit note hold nothing.
 * `exceptInvoiceId`: the draft being edited or issued. Returns the number of
 * distinct samples; throws the 400 / 409.
 */
export async function checkSampleLines(
  tx: Tx,
  lines: readonly { sampleId: string | null }[],
  clientId: string,
  exceptInvoiceId?: string
): Promise<number> {
  const sampleIds = Array.from(new Set(lines.map((line) => line.sampleId).filter((id): id is string => Boolean(id))));
  if (sampleIds.length === 0) return 0;

  await tx.$queryRaw`SELECT \`id\` FROM \`Sample\` WHERE \`id\` IN (${Prisma.join(sampleIds)}) FOR UPDATE`;

  // The lines holding these samples, read with a locking read: a plain read
  // would see the transaction's snapshot, taken before the sample lock was
  // granted, and miss a draft committed meanwhile. Same rule as
  // holdingInvoiceItemWhere() (lib/billing.ts).
  const holders = await tx.$queryRaw<{ sampleId: string; number: string | null; status: string }[]>`
    SELECT ii.\`sampleId\` AS sampleId, i.\`number\` AS number, i.\`status\` AS status
    FROM \`InvoiceItem\` ii
    JOIN \`Invoice\` i ON i.\`id\` = ii.\`invoiceId\`
    WHERE ii.\`sampleId\` IN (${Prisma.join(sampleIds)})
      AND i.\`kind\` = 'FACTURE'
      AND i.\`status\` IN (${Prisma.join([...SAMPLE_HOLDING_STATUSES])})
      AND i.\`id\` <> ${exceptInvoiceId ?? ""}
    FOR SHARE`;

  const samples = await tx.sample.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      code: true,
      clientId: true,
      status: true,
      serie: { select: { site: { select: { billingClientId: true, billingClient: { select: { name: true } } } } } },
    },
  });

  if (samples.length !== sampleIds.length) {
    throw new InvoiceRequestError(400, "Un échantillon référencé est introuvable.");
  }

  for (const sample of samples) {
    // One client per sample: its site's billing client, else its own client.
    const refusal = invoiceSampleRefusal(
      {
        code: sample.code,
        clientId: sample.clientId,
        siteBillingClientId: sample.serie.site?.billingClientId ?? null,
        siteBillingClientName: sample.serie.site?.billingClient?.name ?? null,
      },
      clientId
    );
    if (refusal) throw new InvoiceRequestError(400, refusal);
    if (!BILLABLE_STATUSES.includes(sample.status)) {
      throw new InvoiceRequestError(
        409,
        `L'échantillon ${sample.code} n'est pas facturable : son programme d'analyse n'est pas confirmé, ou il est annulé.`
      );
    }
    const holder = holders.find((row) => row.sampleId === sample.id);
    if (holder) {
      throw new InvoiceRequestError(
        409,
        holder.status === "BROUILLON" || !holder.number
          ? `L'échantillon ${sample.code} est déjà réservé par un brouillon de facture.`
          : `L'échantillon ${sample.code} est déjà facturé (${holder.number}).`
      );
    }
  }
  return sampleIds.length;
}

/** Everything the invoice sheet reads (GET /api/invoices/[id] and the write responses). */
export const INVOICE_DETAIL_INCLUDE = {
  client: true,
  createdBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  items: {
    include: { sample: { select: { id: true, code: true, controlCode: true, status: true } } },
  },
  payments: {
    orderBy: { paidAt: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  },
  creditNotes: {
    select: { id: true, number: true, total: true, issueDate: true, issuedAt: true, notes: true },
    orderBy: { createdAt: "asc" },
  },
  creditedInvoice: { select: { id: true, number: true, issueDate: true, issuedAt: true, total: true } },
} satisfies Prisma.InvoiceInclude;

/** What a list row reads: the amounts behind « Reste à payer », not the details. */
export const INVOICE_LIST_INCLUDE = {
  client: true,
  createdBy: { select: { id: true, name: true } },
  items: true,
  payments: { select: { amount: true } },
  creditNotes: { select: { total: true } },
  creditedInvoice: { select: { id: true, number: true } },
} satisfies Prisma.InvoiceInclude;

type ViewableInvoice = {
  kind: "FACTURE" | "AVOIR";
  status: "BROUILLON" | "EN_ATTENTE" | "PAYEE" | "ANNULEE";
  taxRate: unknown;
  subtotal: unknown;
  taxAmount: unknown;
  total: unknown;
  items?: { id: string; description: string; quantity: number; unitPrice: unknown; lineTotal: unknown }[];
  payments: ({ amount: unknown } & Record<string, unknown>)[];
  creditNotes: ({ total: unknown } & Record<string, unknown>)[];
  creditedInvoice?: ({ total?: unknown } & Record<string, unknown>) | null;
};

const money = (value: unknown) => toMoney(value as never);

/**
 * An invoice for the wire: amounts as numbers (serializeInvoice), plus what
 * it reads as — `paidAmount`, `creditedAmount`, `balance`,
 * `remainingCreditable`, `state`, `stateLabel` — and `actions`, what the
 * sheet may offer. Every invoice leaving these routes goes through here.
 */
export function invoiceView<T extends ViewableInvoice>(invoice: T) {
  const amounts = invoiceAmounts({
    kind: invoice.kind,
    status: invoice.status,
    total: money(invoice.total),
    payments: invoice.payments.map((payment) => money(payment.amount)),
    creditNotes: invoice.creditNotes.map((note) => money(note.total)),
  });
  return {
    ...serializeInvoice(invoice),
    payments: invoice.payments.map((payment) => ({ ...payment, amount: money(payment.amount) })),
    creditNotes: invoice.creditNotes.map((note) => ({ ...note, total: money(note.total) })),
    creditedInvoice: invoice.creditedInvoice
      ? {
          ...invoice.creditedInvoice,
          ...("total" in invoice.creditedInvoice ? { total: money(invoice.creditedInvoice.total) } : {}),
        }
      : null,
    ...amounts,
    stateLabel: INVOICE_STATE_LABELS[amounts.state],
    actions: invoiceActions(invoice, amounts, invoice.payments.length),
  };
}
