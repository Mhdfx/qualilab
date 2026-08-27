import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { validateStockItem } from "@/lib/achat-validation";
import { isLowStock } from "@/lib/stock";

/** Edit (name, category, unit, threshold) or archive one stock article. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.stockItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  if (typeof input.archived === "boolean" && Object.keys(input).length === 1) {
    const item = await prisma.stockItem.update({
      where: { id },
      data: { archived: input.archived },
    });
    await logAudit({
      actorId: session.id,
      action: input.archived ? "STOCK_ITEM_ARCHIVED" : "STOCK_ITEM_RESTORED",
      entity: "StockItem",
      entityId: id,
      metadata: { name: item.name },
    });
    return NextResponse.json(item);
  }

  const validated = validateStockItem({
    name: existing.name,
    unit: existing.unit,
    ...input,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.name !== existing.name) {
    const duplicate = await prisma.stockItem.findUnique({
      where: { name: validated.value.name },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Un article porte déjà ce nom." },
        { status: 409 }
      );
    }
  }

  const item = await prisma.stockItem.update({
    where: { id },
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "STOCK_ITEM_UPDATED",
    entity: "StockItem",
    entityId: id,
    metadata: {
      name: item.name,
      before: { minQuantity: toMoney(existing.minQuantity) },
      after: { minQuantity: toMoney(item.minQuantity) },
    },
  });

  const quantity = toMoney(item.quantity);
  const minQuantity = toMoney(item.minQuantity);
  return NextResponse.json({
    ...item,
    quantity,
    minQuantity,
    low: isLowStock(quantity, minQuantity),
  });
}
