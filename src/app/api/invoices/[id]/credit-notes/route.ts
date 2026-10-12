import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { drawDocumentNumber } from "@/lib/invoice-number";
import { checkCreditNote, checkReason, remainingCreditable, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { cleanCreditNoteLines, creditedByItem, creditNoteLinesRefusal, creditNoteRefusal } from "@/lib/billing";
import { toMoney } from "@/lib/money";
import { CLIENT_IDENTITY_SELECT, clientSnapshotOf, invoiceClientIdentity } from "@/lib/invoice-client-identity";
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
 * invoice's VAT, for the invoice's client — printed as the invoice prints it
 * (its `clientSnapshot` is copied); positive amounts; never a sample
 * (a credit note does not make a sample billable again). A line taken from
 * an invoice line (`invoiceItemId`, stored as `creditedItemId`) may lower its
 * quantity or price, never raise them, and what all the credit notes take
 * back from one line never exceeds that line's total HT. The credit notes of
 * an invoice never exceed its total TTC.
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
            clientSnapshot: true,
            client: { select: CLIENT_IDENTITY_SELECT },
            items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
            payments: { select: { amount: true } },
            creditNotes: { select: { total: true } },
          },
        });

        const refusal = creditNoteRefusal(invoice);
        if (refusal) throw new InvoiceRequestError(400, refusal);
        // What earlier credit notes already took back from each line, read
        // under the invoice's lock (every credit note of this invoice takes
        // it first, so none is being written meanwhile).
        const creditedGroups = await tx.invoiceItem.groupBy({
          by: ["creditedItemId"],
          where: {
            creditedItemId: { in: invoice.items.map((item) => item.id) },
            invoice: { kind: "AVOIR", status: { notIn: ["BROUILLON", "ANNULEE"] } },
          },
          _sum: { lineTotal: true },
        });
        const alreadyCredited = creditedByItem(
          creditedGroups.map((group) => ({ creditedItemId: group.creditedItemId, amount: group._sum.lineTotal }))
        );
        const linesRefusal = creditNoteLinesRefusal(cleaned.lines, invoice.items, alreadyCredited);
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

        // Addressed to the client exactly as the credited invoice prints it.
        const identity = invoiceClientIdentity(invoice);
        const now = new Date();
        const number = await drawDocumentNumber(tx, "AVOIR", now);
        const creditNote = await tx.invoice.create({
          data: {
            number,
            kind: "AVOIR",
            creditedInvoiceId: invoice.id,
            clientId: invoice.clientId,
            clientSnapshot: clientSnapshotOf(identity),
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
                // The invoice line it takes back (checked above), null for a free line.
                creditedItemId: line.invoiceItemId ?? null,
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
          client: identity.name,
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
