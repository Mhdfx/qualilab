import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/invoice-number";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const invoices = await prisma.invoice.findMany({
    include: {
      client: true,
      createdBy: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invoices);
}

type IncomingItem = {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

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

    const cleanItems = (items ?? [])
      .map((item) => ({
        description: (item.description ?? "").trim(),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      }))
      .filter((item) => item.description && item.quantity > 0);

    if (cleanItems.length === 0) {
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

    const rate = Math.max(0, Number(taxRate) || 0);
    const itemsWithTotals = cleanItems.map((item) => ({
      ...item,
      lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));
    const subtotal =
      Math.round(
        itemsWithTotals.reduce((sum, item) => sum + item.lineTotal, 0) * 100
      ) / 100;
    const taxAmount = Math.round(subtotal * (rate / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const number = await generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        number,
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
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Invoice creation failed:", error);
    return NextResponse.json(
      { error: "Impossible de créer la facture." },
      { status: 500 }
    );
  }
}
