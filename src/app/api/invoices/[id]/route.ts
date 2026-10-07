import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { drawDocumentNumber } from "@/lib/invoice-number";
import { computeInvoiceTotals } from "@/lib/invoice-math";
import { canEditDraft, statusAfterPayments } from "@/lib/invoice-lifecycle";
import { toMoney } from "@/lib/money";
import {
  INVOICE_DETAIL_INCLUDE,
  InvoiceRequestError,
  checkSampleLines,
  errorResponse,
  invoiceView,
  lockInvoice,
  parseDraftFields,
  readBody,
} from "../invoice-store";

type Params = { params: Promise<{ id: string }> };

const NOT_A_DRAFT =
  "Seul un brouillon se modifie : une facture émise ne change plus. Pour la corriger, établissez un avoir.";

/**
 * One invoice or credit note, with what it reads as: its settlements, its
 * credit notes (or the invoice it corrects), `paidAmount`, `creditedAmount`,
 * `balance`, `state` and the `actions` the sheet may offer (FACTURATION.md §4).
 */
export async function GET(_request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: INVOICE_DETAIL_INCLUDE,
  });

  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  return NextResponse.json(invoiceView(invoice));
}

/**
 * Edits a draft — `{ clientId, items, taxRate, dueDate?, notes?, issue? }`,
 * the whole draft as on creation; its lines are replaced. `issue: true`
 * saves and issues in the same transaction. 409 once issued: an issued
 * invoice never changes (FACTURATION.md §1).
 */
export async function PATCH(request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  try {
    if (body.issue !== undefined && typeof body.issue !== "boolean") {
      return NextResponse.json({ error: "Le champ « issue » doit valoir true ou false." }, { status: 400 });
    }
    const issue = body.issue === true;
    const fields = parseDraftFields(body, { issue });

    const client = await prisma.client.findUnique({
      where: { id: fields.clientId },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    const { subtotal, taxAmount, total } = computeInvoiceTotals(fields.lines, fields.taxRate);

    const { invoice, samples } = await prisma.$transaction(
      async (tx) => {
        await lockInvoice(tx, id);
        const current = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: { status: true, kind: true },
        });
        if (!canEditDraft(current)) throw new InvoiceRequestError(409, NOT_A_DRAFT);

        const samples = await checkSampleLines(tx, fields.lines, fields.clientId, id);
        const now = new Date();
        const number = issue ? await drawDocumentNumber(tx, "FACTURE", now) : null;

        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        const invoice = await tx.invoice.update({
          where: { id },
          data: {
            clientId: fields.clientId,
            dueDate: fields.dueDate,
            notes: fields.notes,
            taxRate: fields.taxRate,
            subtotal,
            taxAmount,
            total,
            items: { create: fields.lines },
            ...(issue
              ? { number, status: statusAfterPayments(total, 0, 0), issueDate: now, issuedAt: now }
              : {}),
          },
          include: INVOICE_DETAIL_INCLUDE,
        });
        return { invoice, samples };
      },
      { timeout: 20_000 }
    );

    const metadata = {
      number: invoice.number,
      client: client.name,
      total,
      lines: fields.lines.length,
      samples,
    };
    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.INVOICE_DRAFT_UPDATED,
      entity: "Invoice",
      entityId: id,
      metadata,
    });
    if (issue) {
      await logAudit({
        actorId: session.id,
        action: AUDIT_ACTIONS.INVOICE_ISSUED,
        entity: "Invoice",
        entityId: id,
        metadata: { ...metadata, status: invoice.status },
      });
    }

    return NextResponse.json(invoiceView(invoice));
  } catch (error) {
    return errorResponse(error, "Impossible d'enregistrer le brouillon.", { route: "PATCH /api/invoices/[id]", id });
  }
}

/** Deletes a draft — its samples are released. 409 once issued (cancel it instead). */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          kind: true,
          total: true,
          client: { select: { name: true } },
          _count: { select: { items: true } },
        },
      });
      if (!canEditDraft(current)) {
        throw new InvoiceRequestError(
          409,
          "Seul un brouillon se supprime : une facture émise s'annule (avec un motif) ou se corrige par un avoir."
        );
      }
      await tx.invoice.delete({ where: { id } });
      return current;
    });

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.INVOICE_DRAFT_DELETED,
      entity: "Invoice",
      entityId: id,
      metadata: {
        number: null,
        client: deleted.client.name,
        total: toMoney(deleted.total),
        lines: deleted._count.items,
      },
    });

    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    return errorResponse(error, "Impossible de supprimer le brouillon.", { route: "DELETE /api/invoices/[id]", id });
  }
}
