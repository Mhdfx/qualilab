import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { balance, checkPayment, isRecordablePaymentMode, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { invoiceAmounts, parsePaidAt, paymentRefusal } from "@/lib/billing";
import { toMoney } from "@/lib/money";
import { InvoiceRequestError, errorResponse, lockInvoice, readBody } from "../../invoice-store";

type Params = { params: Promise<{ id: string }> };

/**
 * The settlements of an invoice (FACTURATION.md §3), oldest first, with what
 * they leave to pay.
 *
 * → 200 `{ items: Payment[], paidAmount, creditedAmount, balance, status, state }`.
 */
export async function GET(_request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      kind: true,
      status: true,
      total: true,
      payments: {
        orderBy: { paidAt: "asc" },
        include: { createdBy: { select: { id: true, name: true } } },
      },
      creditNotes: { select: { total: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const amounts = invoiceAmounts({
    kind: invoice.kind,
    status: invoice.status,
    total: invoice.total,
    payments: invoice.payments.map((payment) => payment.amount),
    creditNotes: invoice.creditNotes.map((note) => note.total),
  });

  return NextResponse.json({
    items: invoice.payments.map((payment) => ({ ...payment, amount: toMoney(payment.amount) })),
    paidAmount: amounts.paidAmount,
    creditedAmount: amounts.creditedAmount,
    balance: amounts.balance,
    status: invoice.status,
    state: amounts.state,
  });
}

/**
 * « Enregistrer un règlement »: `{ amount, mode, paidAt, reference?, note? }`.
 * The amount is above zero and never more than what is left to pay; the
 * mode is one of ESPECES, CHEQUE, EFFET, CARTE, VIREMENT (AUTRE is never
 * typed); the date is not in the future. The invoice turns « Payée » in the
 * same transaction when nothing is left.
 *
 * → 201 `{ payment, invoice: { id, number, status, paidAmount, creditedAmount, balance, state } }`;
 * 409 on a draft, a cancelled invoice or a credit note.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  if (!isRecordablePaymentMode(body.mode)) {
    return NextResponse.json({ error: "Choisissez le mode de règlement." }, { status: 400 });
  }
  const mode = body.mode;
  const paidAt = parsePaidAt(body.paidAt);
  if (!paidAt.ok) return NextResponse.json({ error: paidAt.error }, { status: 400 });
  const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
  if (reference && reference.length > 191) {
    return NextResponse.json({ error: "La référence est trop longue (191 caractères max)." }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > 5000) {
    return NextResponse.json({ error: "La note est trop longue (5 000 caractères max)." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id },
        select: {
          kind: true,
          status: true,
          number: true,
          total: true,
          payments: { select: { amount: true } },
          creditNotes: { select: { total: true } },
        },
      });
      const refusal = paymentRefusal(invoice);
      if (refusal) throw new InvoiceRequestError(409, refusal);

      const paid = invoice.payments.reduce((sum, payment) => sum + toMoney(payment.amount), 0);
      const credited = invoice.creditNotes.reduce((sum, credit) => sum + toMoney(credit.total), 0);
      const amountError = checkPayment(body.amount, balance(invoice.total, paid, credited));
      if (amountError) throw new InvoiceRequestError(400, amountError);
      const amount = toMoney(typeof body.amount === "string" ? body.amount.replace(",", ".") : (body.amount as number));

      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          amount,
          mode,
          paidAt: paidAt.date,
          reference,
          note,
          createdById: session.id,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });

      const status = statusAfterPayments(invoice.total, paid + amount, credited);
      if (status !== invoice.status) {
        await tx.invoice.update({ where: { id }, data: { status } });
      }

      const amounts = invoiceAmounts({
        kind: invoice.kind,
        status,
        total: invoice.total,
        payments: [...invoice.payments.map((p) => p.amount), amount],
        creditNotes: invoice.creditNotes.map((c) => c.total),
      });
      return { payment, number: invoice.number, status, amounts };
    });

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.PAYMENT_RECORDED,
      entity: "Invoice",
      entityId: id,
      metadata: {
        number: result.number,
        paymentId: result.payment.id,
        amount: toMoney(result.payment.amount),
        mode,
        paidAt: paidAt.date.toISOString(),
        reference,
        status: result.status,
        balance: result.amounts.balance,
      },
    });

    return NextResponse.json(
      {
        payment: { ...result.payment, amount: toMoney(result.payment.amount) },
        invoice: {
          id,
          number: result.number,
          status: result.status,
          paidAmount: result.amounts.paidAmount,
          creditedAmount: result.amounts.creditedAmount,
          balance: result.amounts.balance,
          state: result.amounts.state,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Impossible d'enregistrer le règlement.", { route: "POST /api/invoices/[id]/payments", id });
  }
}
