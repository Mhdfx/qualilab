import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkReason, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { invoiceAmounts } from "@/lib/billing";
import { toMoney } from "@/lib/money";
import { InvoiceRequestError, errorResponse, lockInvoice, readBody } from "../../../invoice-store";

/**
 * Deletes a settlement recorded by mistake (FACTURATION.md §3): `{ reason }`,
 * at least three characters, kept in the journal with the amount and the
 * mode. The invoice goes back to « En attente » in the same transaction when
 * something is left to pay again.
 *
 * → 200 `{ id, deleted: true, invoice: { id, number, status, paidAmount, creditedAmount, balance, state } }`.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id, paymentId } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  const reasonError = checkReason(body.reason);
  if (reasonError) return NextResponse.json({ error: reasonError }, { status: 400 });
  const reason = String(body.reason).trim();

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
          payments: { select: { id: true, amount: true, mode: true, paidAt: true, reference: true } },
          creditNotes: { select: { total: true } },
        },
      });
      const payment = invoice.payments.find((candidate) => candidate.id === paymentId);
      if (!payment) throw new InvoiceRequestError(404, "Règlement introuvable.");

      await tx.payment.delete({ where: { id: paymentId } });

      const payments = invoice.payments
        .filter((candidate) => candidate.id !== paymentId)
        .map((candidate) => candidate.amount);
      const creditNotes = invoice.creditNotes.map((credit) => credit.total);

      // Only an issued invoice carries settlements; its status follows them.
      let status = invoice.status;
      if (invoice.kind === "FACTURE" && (invoice.status === "EN_ATTENTE" || invoice.status === "PAYEE")) {
        const paid = payments.reduce<number>((sum, amount) => sum + toMoney(amount), 0);
        const credited = creditNotes.reduce<number>((sum, total) => sum + toMoney(total), 0);
        status = statusAfterPayments(invoice.total, paid, credited);
        if (status !== invoice.status) {
          await tx.invoice.update({ where: { id }, data: { status } });
        }
      }
      const amounts = invoiceAmounts({ kind: invoice.kind, status, total: invoice.total, payments, creditNotes });
      return { payment, number: invoice.number, status, amounts };
    });

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.PAYMENT_DELETED,
      entity: "Invoice",
      entityId: id,
      metadata: {
        number: result.number,
        paymentId,
        amount: toMoney(result.payment.amount),
        mode: result.payment.mode,
        paidAt: result.payment.paidAt.toISOString(),
        reference: result.payment.reference,
        reason,
        status: result.status,
      },
    });

    return NextResponse.json({
      id: paymentId,
      deleted: true,
      invoice: {
        id,
        number: result.number,
        status: result.status,
        paidAmount: result.amounts.paidAmount,
        creditedAmount: result.amounts.creditedAmount,
        balance: result.amounts.balance,
        state: result.amounts.state,
      },
    });
  } catch (error) {
    return errorResponse(error, "Impossible de supprimer le règlement.", {
      route: "DELETE /api/invoices/[id]/payments/[paymentId]",
      id,
      paymentId,
    });
  }
}
