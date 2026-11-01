import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDecimal } from "@/lib/labels";
import { labDayOf } from "@/lib/lab-time";
import { STOCK_JOURNAL_ORDER_ASC, STOCK_JOURNAL_SELECT } from "@/lib/stock-journal-query";
import {
  MAX_STOCK_EXPORT_ROWS,
  STOCK_JOURNAL_COLUMNS,
  excelDayOf,
  stockJournalFileName,
  stockJournalFilters,
  stockJournalRows,
  stockJournalWhere,
} from "@/lib/stock-journal";

/**
 * The stock register as Excel (lot 3D, M3, the template « Fiche de stock »):
 * the movements of every article (or the filtered ones) in chronological
 * order, in the template's columns, with an automatic filter. Audited.
 */

const MONEY = "#,##0.00";
const QUANTITY = "#,##0.##";
const DAY = "dd/mm/yyyy";

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

  try {
    const movements = await prisma.stockMovement.findMany({
      where: stockJournalWhere(parsed.filters),
      orderBy: STOCK_JOURNAL_ORDER_ASC,
      take: MAX_STOCK_EXPORT_ROWS + 1,
      select: STOCK_JOURNAL_SELECT,
    });
    if (movements.length > MAX_STOCK_EXPORT_ROWS) {
      return NextResponse.json(
        { error: `Trop de lignes : réduisez la période (${formatDecimal(MAX_STOCK_EXPORT_ROWS, 0)} maximum).` },
        { status: 400 }
      );
    }
    const rows = stockJournalRows(movements, labDayOf);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Qualilab";
    const sheet = workbook.addWorksheet("Fiche de stock");
    sheet.columns = STOCK_JOURNAL_COLUMNS.map(({ header, key, width, format }) => ({
      header,
      key,
      width,
      ...(format ? { style: { numFmt: format === "day" ? DAY : format === "money" ? MONEY : QUANTITY } } : {}),
    }));
    for (const row of rows) {
      sheet.addRow({ ...row, day: excelDayOf(row.day), expiry: excelDayOf(row.expiry) });
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: STOCK_JOURNAL_COLUMNS.length } };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const now = new Date();
    const fileName = stockJournalFileName(parsed.filters, labDayOf(now));

    await logAudit({
      actorId: session.id,
      action: "STOCK_JOURNAL_EXPORTED",
      entity: "StockMovement",
      metadata: { du: parsed.filters.fromDay, au: parsed.filters.toDay, article: parsed.filters.itemId, type: parsed.filters.type, rows: rows.length },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[stock/journal/export] failed", error);
    return NextResponse.json({ error: "L'export n'a pas pu être généré. Réessayez." }, { status: 500 });
  }
}
