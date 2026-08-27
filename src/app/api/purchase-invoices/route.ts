import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { validatePurchaseInvoice } from "@/lib/achat-validation";
import { dueDateFor, dueState } from "@/lib/stock";

/**
 * Supplier invoices — the payment-due alerts' data source. The due date
 * defaults to the supplier's payment convention; each row is served with
 * its computed due state so every screen judges lateness identically.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const invoices = await prisma.purchaseInvoice.findMany({
    where: status === "A_PAYER" || status === "PAYEE" ? { status } : undefined,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 200,
    include: { supplier: { select: { id: true, name: true } } },
  });

  return NextResponse.json(
    invoices.map((invoice) => ({
      ...invoice,
      amount: toMoney(invoice.amount),
      due: invoice.status === "A_PAYER" ? dueState(invoice.dueDate) : "OK",
    }))
  );
}

export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const supplierId = typeof input.supplierId === "string" ? input.supplierId : "";
  const supplier = supplierId
    ? await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, paymentTermDays: true, archived: true },
      })
    : null;
  if (!supplier || supplier.archived) {
    return NextResponse.json({ error: "Fournisseur invalide." }, { status: 400 });
  }

  const validated = validatePurchaseInvoice(input);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const dueDate =
    validated.value.dueDate ??
    dueDateFor(validated.value.issueDate, supplier.paymentTermDays);

  try {
    const invoice = await prisma.purchaseInvoice.create({
      data: {
        supplierId: supplier.id,
        number: validated.value.number,
        label: validated.value.label,
        amount: validated.value.amount,
        issueDate: validated.value.issueDate,
        dueDate,
        createdById: session.id,
      },
      include: { supplier: { select: { id: true, name: true } } },
    });

    await logAudit({
      actorId: session.id,
      action: "PURCHASE_INVOICE_CREATED",
      entity: "PurchaseInvoice",
      entityId: invoice.id,
      metadata: {
        supplier: supplier.name,
        number: invoice.number,
        amount: toMoney(invoice.amount),
        dueDate: invoice.dueDate,
      },
    });

    return NextResponse.json(
      { ...invoice, amount: toMoney(invoice.amount), due: dueState(invoice.dueDate) },
      { status: 201 }
    );
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Cette facture existe déjà pour ce fournisseur." },
        { status: 409 }
      );
    }
    throw error;
  }
}
