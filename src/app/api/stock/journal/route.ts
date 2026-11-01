import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { labDayOf } from "@/lib/lab-time";
import { pageParams, toPage } from "@/lib/pagination";
import { STOCK_JOURNAL_SELECT, STOCK_JOURNAL_ORDER_DESC } from "@/lib/stock-journal-query";
import { stockJournalFilters, stockJournalRows, stockJournalWhere } from "@/lib/stock-journal";

/**
 * Le journal des mouvements de stock (lot 3D, M3): every article's
 * movements, newest first, filtered by period (`du` / `au`), article
 * (`article`) and type (`type`), paged by `?cursor=` without a ceiling.
 * The rows are `stockJournalRows` — the same the Excel export writes.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const parsed = stockJournalFilters({
    du: params.get("du"),
    au: params.get("au"),
    article: params.get("article"),
    type: params.get("type"),
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const page = pageParams(request);
  const movements = await prisma.stockMovement.findMany({
    where: stockJournalWhere(parsed.filters),
    orderBy: STOCK_JOURNAL_ORDER_DESC,
    take: page.take + 1,
    ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
    select: STOCK_JOURNAL_SELECT,
  });
  const { items, nextCursor } = toPage(movements, page.take);
  return NextResponse.json({ items: stockJournalRows(items, labDayOf), nextCursor });
}
