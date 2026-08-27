import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";

/**
 * Marking a supplier invoice paid (or unpaid again, for a mistaken click).
 * The amounts and dates of a recorded invoice are not edited — a wrong one
 * is corrected by the supplier with an avoir, not by rewriting history.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: { supplier: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { status } = (body ?? {}) as { status?: unknown };

  if (status !== "PAYEE" && status !== "A_PAYER") {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const invoice = await prisma.purchaseInvoice.update({
    where: { id },
    data: { status, paidAt: status === "PAYEE" ? new Date() : null },
    include: { supplier: { select: { id: true, name: true } } },
  });

  await logAudit({
    actorId: session.id,
    action: status === "PAYEE" ? "PURCHASE_INVOICE_PAID" : "PURCHASE_INVOICE_REOPENED",
    entity: "PurchaseInvoice",
    entityId: id,
    metadata: {
      supplier: existing.supplier.name,
      number: existing.number,
      amount: toMoney(existing.amount),
    },
  });

  return NextResponse.json({ ...invoice, amount: toMoney(invoice.amount) });
}
