import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { validateStockItem } from "@/lib/achat-validation";
import { isLowStock } from "@/lib/stock";

/**
 * Stock articles. The quantity itself is never written here — it belongs to
 * the movements (see /api/stock/movements), so the history always explains
 * the level.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  const items = await prisma.stockItem.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    items.map((item) => {
      const quantity = toMoney(item.quantity);
      const minQuantity = toMoney(item.minQuantity);
      return { ...item, quantity, minQuantity, low: isLowStock(quantity, minQuantity) };
    })
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

  const validated = validateStockItem((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

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

  const item = await prisma.stockItem.create({ data: validated.value });

  await logAudit({
    actorId: session.id,
    action: "STOCK_ITEM_CREATED",
    entity: "StockItem",
    entityId: item.id,
    metadata: { name: item.name, unit: item.unit, minQuantity: toMoney(item.minQuantity) },
  });

  return NextResponse.json(
    { ...item, quantity: 0, minQuantity: toMoney(item.minQuantity), low: false },
    { status: 201 }
  );
}
