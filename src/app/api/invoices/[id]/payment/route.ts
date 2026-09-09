import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";

/**
 * Recording the payment of a client invoice — or reopening one marked paid
 * by mistake.
 *
 * The amounts of an issued invoice are never rewritten: a wrong invoice is
 * corrected with an avoir. Only the settlement status moves, and each move is
 * journalised, because it is what feeds the « Encaissé » figure the direction
 * reads.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, total: true, status: true },
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

  if (status !== "PAYEE" && status !== "EN_ATTENTE") {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status },
    select: { id: true, number: true, status: true, total: true },
  });

  await logAudit({
    actorId: session.id,
    action: status === "PAYEE" ? "INVOICE_PAID" : "INVOICE_REOPENED",
    entity: "Invoice",
    entityId: id,
    metadata: {
      number: existing.number,
      from: existing.status,
      to: status,
      total: toMoney(existing.total),
    },
  });

  return NextResponse.json({ ...invoice, total: toMoney(invoice.total) });
}
