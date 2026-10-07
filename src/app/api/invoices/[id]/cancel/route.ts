import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { cancelRefusal, checkReason } from "@/lib/invoice-lifecycle";
import { toMoney } from "@/lib/money";
import { InvoiceRequestError, errorResponse, lockInvoice, readBody } from "../../invoice-store";

/**
 * « Annuler » an issued invoice (FACTURATION.md §1): `{ reason }`, at least
 * three characters. Only an issued invoice with no settlement and no credit
 * note — otherwise 409, and the way out is a credit note. The number is kept
 * (no gap in the sequence), the PDF is stamped « ANNULÉE », and its samples
 * become billable again (a cancelled invoice holds none: lib/billing.ts).
 *
 * → 200 `{ id, number, status: "ANNULEE", cancelledAt, cancelReason }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          kind: true,
          number: true,
          total: true,
          client: { select: { name: true } },
          creditNotes: { select: { total: true } },
          _count: { select: { payments: true } },
          items: { where: { sampleId: { not: null } }, select: { sampleId: true } },
        },
      });
      const credited = invoice.creditNotes.reduce((sum, note) => sum + toMoney(note.total), 0);
      const refusal = cancelRefusal({ status: invoice.status, kind: invoice.kind, credited }, invoice._count.payments);
      if (refusal) throw new InvoiceRequestError(409, refusal);

      const reasonError = checkReason(body.reason);
      if (reasonError) throw new InvoiceRequestError(400, reasonError);
      const reason = String(body.reason).trim();

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: "ANNULEE",
          cancelledAt: new Date(),
          cancelledById: session.id,
          cancelReason: reason,
        },
        select: { id: true, number: true, status: true, cancelledAt: true, cancelReason: true },
      });
      return {
        updated,
        client: invoice.client.name,
        total: toMoney(invoice.total),
        samples: new Set(invoice.items.map((item) => item.sampleId)).size,
      };
    });

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.INVOICE_CANCELLED,
      entity: "Invoice",
      entityId: id,
      metadata: {
        number: cancelled.updated.number,
        reason: cancelled.updated.cancelReason,
        client: cancelled.client,
        total: cancelled.total,
        samplesReleased: cancelled.samples,
      },
    });

    return NextResponse.json(cancelled.updated);
  } catch (error) {
    return errorResponse(error, "Impossible d'annuler la facture.", { route: "POST /api/invoices/[id]/cancel", id });
  }
}
