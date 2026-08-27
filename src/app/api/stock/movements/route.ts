import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { applyMovement, isLowStock, type MovementType } from "@/lib/stock";

const TYPES: MovementType[] = ["ENTREE", "SORTIE", "AJUSTEMENT"];

/**
 * One stock movement — the ONLY writer of an article's quantity, inside a
 * transaction whose update is guarded by the level it read: two
 * magasiniers moving the same article at the same instant cannot lose an
 * update, the second one simply retries.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { itemId, type, quantity, lot, expiryDate, note } = (body ?? {}) as {
    itemId?: unknown;
    type?: unknown;
    quantity?: unknown;
    lot?: unknown;
    expiryDate?: unknown;
    note?: unknown;
  };

  if (typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "Article manquant." }, { status: 400 });
  }
  if (!TYPES.includes(type as MovementType)) {
    return NextResponse.json({ error: "Type de mouvement invalide." }, { status: 400 });
  }
  const qty = Number(String(quantity ?? "").replace(",", "."));
  if (!Number.isFinite(qty)) {
    return NextResponse.json({ error: "Quantité illisible." }, { status: 400 });
  }

  let expiry: Date | null = null;
  if (typeof expiryDate === "string" && expiryDate.trim()) {
    expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return NextResponse.json({ error: "Date de péremption invalide." }, { status: 400 });
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const item = await prisma.stockItem.findUnique({ where: { id: itemId } });
    if (!item || item.archived) {
      return NextResponse.json({ error: "Article invalide ou archivé." }, { status: 400 });
    }

    const result = applyMovement(toMoney(item.quantity), type as MovementType, qty);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    try {
      const [movement] = await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            itemId: item.id,
            type: type as MovementType,
            quantity: qty,
            lot: typeof lot === "string" && lot.trim() ? lot.trim() : null,
            expiryDate: expiry,
            note: typeof note === "string" && note.trim() ? note.trim() : null,
            createdById: session.id,
          },
        }),
        prisma.stockItem.update({
          // Guarded by the quantity we computed from: a concurrent movement
          // makes this a P2025 and we re-read instead of losing it.
          where: { id: item.id, quantity: item.quantity },
          data: { quantity: result.next },
        }),
      ]);

      await logAudit({
        actorId: session.id,
        action: "STOCK_MOVEMENT",
        entity: "StockItem",
        entityId: item.id,
        metadata: {
          name: item.name,
          type,
          quantity: qty,
          from: toMoney(item.quantity),
          to: result.next,
          lot: movement.lot,
        },
      });

      return NextResponse.json(
        {
          movement,
          item: {
            id: item.id,
            quantity: result.next,
            low: isLowStock(result.next, toMoney(item.minQuantity)),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      if ((error as { code?: string }).code === "P2025" && attempt < 2) continue;
      throw error;
    }
  }

  return NextResponse.json(
    { error: "Mouvements simultanés sur cet article — réessayez." },
    { status: 409 }
  );
}

/** Recent movements of one article — its explanation trail. */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ error: "Article manquant." }, { status: 400 });
  }

  const movements = await prisma.stockMovement.findMany({
    where: { itemId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(
    movements.map((movement) => ({
      ...movement,
      quantity: toMoney(movement.quantity),
    }))
  );
}
