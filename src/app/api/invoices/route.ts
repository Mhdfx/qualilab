import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceKind, InvoiceStatus } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { pageParams, toPage } from "@/lib/pagination";
import { drawDocumentNumber } from "@/lib/invoice-number";
import { computeInvoiceTotals } from "@/lib/invoice-math";
import { statusAfterPayments } from "@/lib/invoice-lifecycle";
import {
  INVOICE_DETAIL_INCLUDE,
  INVOICE_LIST_INCLUDE,
  checkSampleLines,
  errorResponse,
  invoiceView,
  parseDraftFields,
  readBody,
} from "./invoice-store";

const STATUSES: readonly InvoiceStatus[] = ["BROUILLON", "EN_ATTENTE", "PAYEE", "ANNULEE"];
const KINDS: readonly InvoiceKind[] = ["FACTURE", "AVOIR"];

/**
 * The invoices and credit notes, newest first, one page at a time.
 * `?status=` (BROUILLON | EN_ATTENTE | PAYEE | ANNULEE, several separated by
 * commas) and `?kind=` (FACTURE | AVOIR) narrow the list — drafts and
 * cancelled invoices are listed apart (FACTURATION.md §4–5).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const where: Prisma.InvoiceWhereInput = {};

  const statusParam = url.searchParams.get("status");
  if (statusParam) {
    const statuses = statusParam.split(",").map((value) => value.trim().toUpperCase());
    if (!statuses.every((value) => (STATUSES as readonly string[]).includes(value))) {
      return NextResponse.json({ error: "Statut de facture inconnu." }, { status: 400 });
    }
    where.status = { in: statuses as InvoiceStatus[] };
  }

  const kindParam = url.searchParams.get("kind");
  if (kindParam) {
    const kind = kindParam.trim().toUpperCase();
    if (!(KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: "Type de document inconnu." }, { status: 400 });
    }
    where.kind = kind as InvoiceKind;
  }

  const { take, cursor, skip } = pageParams(request);

  const rows = await prisma.invoice.findMany({
    where,
    include: INVOICE_LIST_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    cursor,
    skip,
  });

  const page = toPage(rows, take);
  return NextResponse.json({
    ...page,
    items: page.items.map(invoiceView),
  });
}

/**
 * A new invoice: `{ clientId, items, taxRate, dueDate?, notes?, issue }`.
 * `issue: false` saves a draft — no number, its samples reserved;
 * `issue: true` (also when `issue` is absent, the behaviour before drafts)
 * issues it at once with the next « FAC-AAAA-NNNN », drawn in the same
 * transaction as the row (FACTURATION.md §1).
 */
export async function POST(request: Request) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  try {
    if (body.issue !== undefined && typeof body.issue !== "boolean") {
      return NextResponse.json({ error: "Le champ « issue » doit valoir true ou false." }, { status: 400 });
    }
    const issue = body.issue === undefined ? true : body.issue;
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
        const samples = await checkSampleLines(tx, fields.lines, fields.clientId);
        const now = new Date();
        const number = issue ? await drawDocumentNumber(tx, "FACTURE", now) : null;
        const invoice = await tx.invoice.create({
          data: {
            number,
            kind: "FACTURE",
            clientId: fields.clientId,
            createdById: session.id,
            // An issued invoice of 0,00 has nothing left to pay.
            status: issue ? statusAfterPayments(total, 0, 0) : "BROUILLON",
            issueDate: now,
            issuedAt: issue ? now : null,
            dueDate: fields.dueDate,
            notes: fields.notes,
            taxRate: fields.taxRate,
            subtotal,
            taxAmount,
            total,
            items: { create: fields.lines },
          },
          include: INVOICE_DETAIL_INCLUDE,
        });
        return { invoice, samples };
      },
      { timeout: 20_000 }
    );

    await logAudit({
      actorId: session.id,
      action: issue ? AUDIT_ACTIONS.INVOICE_ISSUED : AUDIT_ACTIONS.INVOICE_DRAFT_CREATED,
      entity: "Invoice",
      entityId: invoice.id,
      metadata: {
        number: invoice.number,
        client: client.name,
        total,
        lines: fields.lines.length,
        samples,
        status: invoice.status,
      },
    });

    return NextResponse.json(invoiceView(invoice), { status: 201 });
  } catch (error) {
    return errorResponse(error, "Impossible de créer la facture.", { route: "POST /api/invoices" });
  }
}
