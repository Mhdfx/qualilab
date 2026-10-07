import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { drawDocumentNumber } from "@/lib/invoice-number";
import { checkCreditNote, checkReason, remainingCreditable, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { cleanCreditNoteLines, creditNoteLinesRefusal, creditNoteRefusal } from "@/lib/billing";
import { toMoney } from "@/lib/money";
import {
  INVOICE_DETAIL_INCLUDE,
  InvoiceRequestError,
  errorResponse,
  invoiceView,
  lockInvoice,
  readBody,
} from "../../invoice-store";

/**
 * A credit note against an issued invoice (FACTURATION.md §2):
 * `{ items: [{ description, quantity, unitPrice, invoiceItemId? }], reason }`.
 *
 * Issued at once with « AV-AAAA-NNNN » from the AVOIR counter, at the
 * invoice's VAT, for the invoice's client; positive amounts; never a sample
 * (a credit note does not make a sample billable again). A line taken from
 * an invoice line (`invoiceItemId`) may lower its quantity or price, never
 * raise them. The credit notes of an invoice never exceed its total TTC.
 * The reason is kept as the credit note's notes (« Motif de l'avoir » on the
 * PDF). When it covers what was left to pay, the invoice reads « Payée ».
 *
 * → 201 the credit note (as GET /api/invoices/[id]); 400 when the invoice
 * is not issued, is cancelled or is itself a credit note, or when the total
 * exceeds what may still be credited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  const cleaned = cleanCreditNoteLines(body.items);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const reasonError = checkReason(body.reason);
  if (reasonError) return NextResponse.json({ error: reasonError }, { status: 400 });
  const reason = String(body.reason).trim();
  if (reason.length > 5000) {
    return NextResponse.json({ error: "Le motif est trop long (5 000 caractères max)." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockInvoice(tx, id);
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            kind: true,
            status: true,
            number: true,
            clientId: true,
            taxRate: true,
            total: true,
            client: { select: { name: true } },
            items: { select: { id: true, quantity: true, unitPrice: true } },
            payments: { select: { amount: true } },
            creditNotes: { select: { total: true } },
          },
        });

        const refusal = creditNoteRefusal(invoice);
        if (refusal) throw new InvoiceRequestError(400, refusal);
        const linesRefusal = creditNoteLinesRefusal(cleaned.lines, invoice.items);
        if (linesRefusal) throw new InvoiceRequestError(400, linesRefusal);

        const credited = invoice.creditNotes.reduce((sum, note) => sum + toMoney(note.total), 0);
        const paid = invoice.payments.reduce((sum, payment) => sum + toMoney(payment.amount), 0);
        const check = checkCreditNote(
          cleaned.lines,
          remainingCreditable(invoice.total, credited),
          toMoney(invoice.taxRate)
        );
        if (!check.ok) throw new InvoiceRequestError(400, check.error);
        const { subtotal, taxAmount, total, lines } = check.totals;

        const now = new Date();
        const number = await drawDocumentNumber(tx, "AVOIR", now);
        const creditNote = await tx.invoice.create({
          data: {
            number,
            kind: "AVOIR",
            creditedInvoiceId: invoice.id,
            clientId: invoice.clientId,
            createdById: session.id,
            status: "EN_ATTENTE",
            issueDate: now,
            issuedAt: now,
            notes: reason,
            taxRate: invoice.taxRate,
            subtotal,
            taxAmount,
            total,
            items: {
              create: cleaned.lines.map((line, index) => ({
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: lines[index].lineHt,
                sampleId: null,
              })),
            },
          },
          include: INVOICE_DETAIL_INCLUDE,
        });

        // What is left to pay may now be nothing.
        const status = statusAfterPayments(invoice.total, paid, credited + total);
        if (status !== invoice.status) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
        }

        return {
          creditNote,
          creditedNumber: invoice.number,
          client: invoice.client.name,
          total,
          invoiceStatus: status,
        };
      },
      { timeout: 20_000 }
    );

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.CREDIT_NOTE_ISSUED,
      entity: "Invoice",
      entityId: result.creditNote.id,
      metadata: {
        number: result.creditNote.number,
        creditedNumber: result.creditedNumber,
        creditedInvoiceId: id,
        client: result.client,
        total: result.total,
        reason,
        invoiceStatus: result.invoiceStatus,
      },
    });

    return NextResponse.json(invoiceView(result.creditNote), { status: 201 });
  } catch (error) {
    return errorResponse(error, "Impossible d'établir l'avoir.", { route: "POST /api/invoices/[id]/credit-notes", id });
  }
}
