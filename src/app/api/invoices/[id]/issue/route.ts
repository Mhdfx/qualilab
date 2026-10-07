import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { drawDocumentNumber } from "@/lib/invoice-number";
import { canIssue, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { unpricedLineRefusal } from "@/lib/billing";
import { toMoney } from "@/lib/money";
import { InvoiceRequestError, checkSampleLines, errorResponse, lockInvoice } from "../../invoice-store";

/**
 * « Émettre » a draft (FACTURATION.md §1): draws « FAC-AAAA-NNNN » from the
 * FACTURE counter in the same transaction, fixes `issuedAt` (and the printed
 * date), and from then on the invoice never changes. Its samples are checked
 * again — one may have been cancelled, or its site billed to another client,
 * since the draft was saved — and every analysis line must have its price.
 *
 * → 200 `{ id, number, status, issuedAt }`; 409 when not a draft.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const issued = await prisma.$transaction(
      async (tx) => {
        await lockInvoice(tx, id);
        const draft = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: {
            status: true,
            kind: true,
            number: true,
            clientId: true,
            total: true,
            client: { select: { name: true } },
            items: { select: { description: true, unitPrice: true, sampleId: true } },
          },
        });
        if (!canIssue(draft)) {
          throw new InvoiceRequestError(
            409,
            draft.number ? `Cette facture est déjà émise (${draft.number}).` : "Seul un brouillon de facture s'émet."
          );
        }
        if (draft.items.length === 0) {
          throw new InvoiceRequestError(400, "Ajoutez au moins une ligne de prestation valide.");
        }
        const unpriced = unpricedLineRefusal(draft.items);
        if (unpriced) throw new InvoiceRequestError(400, unpriced);

        const samples = await checkSampleLines(tx, draft.items, draft.clientId, id);
        const now = new Date();
        const number = await drawDocumentNumber(tx, "FACTURE", now);
        const invoice = await tx.invoice.update({
          where: { id },
          data: {
            number,
            status: statusAfterPayments(draft.total, 0, 0),
            issueDate: now,
            issuedAt: now,
          },
          select: { id: true, number: true, status: true, issuedAt: true },
        });
        return { invoice, client: draft.client.name, total: toMoney(draft.total), lines: draft.items.length, samples };
      },
      { timeout: 20_000 }
    );

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.INVOICE_ISSUED,
      entity: "Invoice",
      entityId: id,
      metadata: {
        number: issued.invoice.number,
        client: issued.client,
        total: issued.total,
        lines: issued.lines,
        samples: issued.samples,
        status: issued.invoice.status,
      },
    });

    return NextResponse.json(issued.invoice);
  } catch (error) {
    return errorResponse(error, "Impossible d'émettre la facture.", { route: "POST /api/invoices/[id]/issue", id });
  }
}
