import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { applyMovement, isLowStock, type MovementType } from "@/lib/stock";
import { isLockConflict } from "@/lib/billing";
import { TEXT_MAX, parseFormDay } from "@/lib/achat-validation";

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
  // Two decimals, like the DECIMAL(12,2) column — the stored movement and
  // the level delta must be the same figure.
  const qty = Math.round(Number(String(quantity ?? "").replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(qty)) {
    return NextResponse.json({ error: "Quantité illisible." }, { status: 400 });
  }

  let expiry: Date | null = null;
  if (typeof expiryDate === "string" && expiryDate.trim()) {
    // A calendar day: « 2027-02-30 » is refused, not rolled over to March.
    expiry = parseFormDay(expiryDate.trim());
    if (!expiry) {
      return NextResponse.json({ error: "Date de péremption invalide." }, { status: 400 });
    }
  }
  if (typeof lot === "string" && lot.trim().length > TEXT_MAX) {
    return NextResponse.json({ error: `Le lot est trop long (${TEXT_MAX} caractères max).` }, { status: 400 });
  }
  // A TEXT column holds 65 535 bytes: a longer note was a 500.
  if (typeof note === "string" && note.trim().length > 5000) {
    return NextResponse.json({ error: "La note est trop longue (5 000 caractères max)." }, { status: 400 });
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

    let movement;
    try {
      movement = await prisma.$transaction(async (tx) => {
        // Guarded by the quantity we computed from, checked in the UPDATE
        // itself (`updateMany` counts the rows it changed): a concurrent
        // movement leaves 0 rows and we re-read instead of losing it. The
        // article row is written first, so the movement's insert (which
        // reads its parent) never waits on a lock the other side holds.
        const moved = await tx.stockItem.updateMany({
          where: { id: item.id, quantity: item.quantity },
          data: { quantity: result.next },
        });
        if (moved.count === 0) return null;
        return tx.stockMovement.create({
          data: {
            itemId: item.id,
            type: type as MovementType,
            quantity: qty,
            lot: typeof lot === "string" && lot.trim() ? lot.trim() : null,
            expiryDate: expiry,
            note: typeof note === "string" && note.trim() ? note.trim() : null,
            createdById: session.id,
          },
        });
      });
    } catch (error) {
      if (isLockConflict(error)) continue;
      throw error;
    }
    if (!movement) continue;

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
        movement: { ...movement, quantity: toMoney(movement.quantity) },
        item: {
          id: item.id,
          quantity: result.next,
          low: isLowStock(result.next, toMoney(item.minQuantity)),
        },
      },
      { status: 201 }
    );
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
