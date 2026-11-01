import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { applyMovement, isLowStock } from "@/lib/stock";
import { isLockConflict } from "@/lib/billing";
import { validateMovement } from "@/lib/achat-validation";
import { labDayOf } from "@/lib/lab-time";
import { isoDayOf } from "@/lib/date-only";
import { pageParams, toPage } from "@/lib/pagination";

/**
 * One stock movement — the ONLY writer of an article's quantity, inside a
 * transaction whose update is guarded by the level it read: two
 * magasiniers moving the same article at the same instant cannot lose an
 * update, the second one simply retries.
 *
 * Lot 3D (RETOUR-LABO-28-10.md M1, M5): the movement carries its day
 * (`movementDate`, today on the lab's clock by default, never in the
 * future), the levels before and after it (written in the same guarded
 * transaction, so they are exactly the levels the update moved between) and,
 * for an entry, its unit price HT.
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

  const validated = validateMovement((body ?? {}) as Record<string, unknown>, labDayOf(new Date()));
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const input = validated.value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const item = await prisma.stockItem.findUnique({ where: { id: input.itemId } });
    if (!item || item.archived) {
      return NextResponse.json({ error: "Article invalide ou archivé." }, { status: 400 });
    }

    const before = toMoney(item.quantity);
    const result = applyMovement(before, input.type, input.quantity);
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
            type: input.type,
            quantity: input.quantity,
            lot: input.lot,
            expiryDate: input.expiryDate,
            note: input.note,
            movementDate: input.movementDate,
            levelBefore: before,
            levelAfter: result.next,
            unitPriceHT: input.unitPriceHT,
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
        type: input.type,
        quantity: input.quantity,
        from: before,
        to: result.next,
        lot: movement.lot,
        day: isoDayOf(input.movementDate),
        ...(input.unitPriceHT !== null ? { unitPriceHT: input.unitPriceHT } : {}),
      },
    });

    return NextResponse.json(
      {
        movement: serializeMovement(movement),
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

type StoredMovement = {
  quantity: unknown;
  levelBefore: unknown;
  levelAfter: unknown;
  unitPriceHT: unknown;
  movementDate: Date | null;
  createdAt: Date;
};

/** Decimals as numbers, the day as « AAAA-MM-JJ » (its recording day before lot 3D). */
function serializeMovement<T extends StoredMovement>(movement: T) {
  const optional = (value: unknown) => (value === null || value === undefined ? null : toMoney(value as string));
  return {
    ...movement,
    quantity: toMoney(movement.quantity as string),
    levelBefore: optional(movement.levelBefore),
    levelAfter: optional(movement.levelAfter),
    unitPriceHT: optional(movement.unitPriceHT),
    day: movement.movementDate ? isoDayOf(movement.movementDate) : labDayOf(movement.createdAt),
  };
}

/**
 * The movements of one article — its explanation trail, newest first.
 * Without a limit (lot 3D, M3): `?cursor=` pages through it, 50 at a time
 * (`{ items, nextCursor }` with `?paged=1`; a bare array of the first page
 * otherwise, as before).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ error: "Article manquant." }, { status: 400 });
  }
  const page = pageParams(request);

  const movements = await prisma.stockMovement.findMany({
    where: { itemId },
    orderBy: [{ movementDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
    take: page.take + 1,
    ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
    include: { createdBy: { select: { name: true } } },
  });

  const { items, nextCursor } = toPage(movements, page.take);
  const serialized = items.map(serializeMovement);
  return NextResponse.json(searchParams.get("paged") === "1" ? { items: serialized, nextCursor } : serialized);
}
