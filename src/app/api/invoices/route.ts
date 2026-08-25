import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pageParams, toPage } from "@/lib/pagination";
import { serializeInvoice } from "@/lib/invoice-serialize";
import { isValidAmount } from "@/lib/money";
import { retryOnDuplicate } from "@/lib/retry-unique";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { computeInvoiceTotals } from "@/lib/invoice-math";

export async function GET(request: Request) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { take, cursor, skip } = pageParams(request);

  const rows = await prisma.invoice.findMany({
    include: {
      client: true,
      createdBy: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    cursor,
    skip,
  });

  const page = toPage(rows, take);
  return NextResponse.json({
    ...page,
    items: page.items.map(serializeInvoice),
  });
}

type IncomingItem = {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

export async function POST(request: Request) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const { clientId, dueDate, notes, taxRate, status, items } = body as {
      clientId?: string;
      dueDate?: string;
      notes?: string;
      taxRate?: number | string;
      status?: string;
      items?: IncomingItem[];
    };

    const invoiceStatus = status === "PAYEE" ? "PAYEE" : "EN_ATTENTE";

    if (!clientId) {
      return NextResponse.json(
        { error: "Veuillez sélectionner un client." },
        { status: 400 }
      );
    }

    const cleanItems = (items ?? []).map((item) => ({
      description: (item.description ?? "").trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    // An invoice is a legal document: a negative or nonsensical amount must be
    // refused here, not quietly coerced to zero.
    for (const item of cleanItems) {
      if (!item.description) continue;
      if (!isValidAmount(item.quantity) || item.quantity <= 0) {
        return NextResponse.json(
          { error: `Quantité invalide pour « ${item.description} ».` },
          { status: 400 }
        );
      }
      if (!isValidAmount(item.unitPrice)) {
        return NextResponse.json(
          { error: `Prix unitaire invalide pour « ${item.description} ».` },
          { status: 400 }
        );
      }
      if (item.quantity > 100000 || item.unitPrice > 10000000) {
        return NextResponse.json(
          { error: `Montant hors limites pour « ${item.description} ».` },
          { status: 400 }
        );
      }
    }

    const billable = cleanItems.filter(
      (item) => item.description && item.quantity > 0
    );

    if (billable.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins une ligne de prestation valide." },
        { status: 400 }
      );
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json(
        { error: "Client introuvable." },
        { status: 404 }
      );
    }

    // VAT is a percentage, not an arbitrary number.
    const rate = Math.min(100, Math.max(0, Number(taxRate) || 0));
    const { subtotal, taxAmount, total } = computeInvoiceTotals(billable, rate);
    const itemsWithTotals = billable.map((item) => ({
      ...item,
      lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));

    // Two accountants invoicing at the same second would otherwise collide on
    // the sequential number; the unique constraint catches it and we retry.
    const invoice = await retryOnDuplicate(async () =>
      prisma.invoice.create({
      data: {
        number: await generateInvoiceNumber(),
        clientId,
        createdById: session.id,
        status: invoiceStatus,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes?.trim() || null,
        taxRate: rate,
        subtotal,
        taxAmount,
        total,
        items: { create: itemsWithTotals },
      },
      include: {
        client: true,
        createdBy: { select: { id: true, name: true } },
        items: true,
      },
      })
    );

    return NextResponse.json(serializeInvoice(invoice), { status: 201 });
  } catch (error) {
    console.error("Invoice creation failed:", error);
    return NextResponse.json(
      { error: "Impossible de créer la facture." },
      { status: 500 }
    );
  }
}
