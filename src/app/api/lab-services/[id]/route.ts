import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isValidAmount, toMoney } from "@/lib/money";

/**
 * Editing a catalogue entry: its label, its price, whether it is offered.
 *
 * Deactivating an entry stops it pricing new invoice lines — existing invoices
 * keep the price they were issued at, since their lines carry their own
 * amounts.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.labService.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Prestation introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { name, unitPrice, active } = (body ?? {}) as {
    name?: unknown;
    unitPrice?: unknown;
    active?: unknown;
  };

  const data: { name?: string; unitPrice?: number; active?: boolean } = {};

  if (typeof name === "string") {
    const clean = name.trim();
    if (!clean) {
      return NextResponse.json({ error: "Le libellé est obligatoire." }, { status: 400 });
    }
    data.name = clean;
  }

  if (unitPrice !== undefined) {
    const price = Number(String(unitPrice).replace(",", "."));
    if (!isValidAmount(price)) {
      return NextResponse.json(
        { error: "Le prix doit être un nombre positif." },
        { status: 400 }
      );
    }
    data.unitPrice = price;
  }

  if (typeof active === "boolean") data.active = active;

  const updated = await prisma.labService.update({ where: { id }, data });

  await logAudit({
    actorId: session.id,
    action: "SERVICE_UPDATED",
    entity: "LabService",
    entityId: id,
    metadata: {
      name: updated.name,
      before: { unitPrice: toMoney(existing.unitPrice), active: existing.active },
      after: { unitPrice: toMoney(updated.unitPrice), active: updated.active },
    },
  });

  return NextResponse.json({ ...updated, unitPrice: toMoney(updated.unitPrice) });
}
