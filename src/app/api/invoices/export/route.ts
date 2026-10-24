import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDayShort, formatDecimal, formatIsoDay } from "@/lib/labels";
import { parseLabDayRange } from "@/lib/lab-day-range";
import { CLIENT_IDENTITY_SELECT, invoiceClientIdentity } from "@/lib/invoice-client-identity";
import {
  MAX_EXPORT_ROWS,
  exportPeriodError,
  salesJournalColumns,
  salesJournalFileName,
  salesJournalRows,
  salesJournalTotals,
  settlementRows,
  settlementsTotal,
} from "@/lib/sales-journal";

/**
 * The accounting export (journal des ventes et règlements, spec EF-22):
 * `?du=AAAA-MM-JJ&au=AAAA-MM-JJ`, inclusive days on the lab's clock, either
 * side optional. One workbook, two sheets — « Journal des ventes » (issued
 * invoices and credit notes by date of issue, credit notes negative, totals
 * without the cancelled invoices) and « Règlements » (settlements by date
 * of receipt). Rows are built by `lib/sales-journal.ts`. Audited.
 *
 * The client's name, ICE, IF and RC (RETOUR-LABO-19-10.md H2) are the ones
 * the document KEEPS (`invoiceClientIdentity`): the snapshot frozen at
 * issue, else — a document issued before the snapshot existed — the live
 * client. A later rename or merge of the client therefore never changes an
 * exported line; a snapshot taken before the IF and the RC existed exports
 * them empty. « Règlements » names the client only.
 */

const MONEY = "#,##0.00";
const DAY = "dd/mm/yyyy";

export async function GET(request: Request) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const periodError = exportPeriodError(params.get("du"), params.get("au"));
  if (periodError) return NextResponse.json({ error: periodError }, { status: 400 });
  const period = parseLabDayRange(params.get("du"), params.get("au"));
  const range =
    period.from || period.until
      ? { ...(period.from ? { gte: period.from } : {}), ...(period.until ? { lt: period.until } : {}) }
      : undefined;

  try {
    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: { not: "BROUILLON" }, issuedAt: range ?? { not: null } },
        orderBy: [{ issuedAt: "asc" }, { number: "asc" }],
        take: MAX_EXPORT_ROWS + 1,
        select: {
          number: true,
          kind: true,
          status: true,
          issuedAt: true,
          subtotal: true,
          taxAmount: true,
          total: true,
          clientSnapshot: true,
          client: { select: CLIENT_IDENTITY_SELECT },
          creditedInvoice: { select: { number: true } },
          payments: { select: { amount: true } },
          creditNotes: { where: { status: { not: "BROUILLON" } }, select: { total: true } },
        },
      }),
      prisma.payment.findMany({
        where: range ? { paidAt: range } : {},
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        take: MAX_EXPORT_ROWS + 1,
        select: {
          paidAt: true,
          amount: true,
          mode: true,
          reference: true,
          invoice: { select: { number: true, clientSnapshot: true, client: { select: CLIENT_IDENTITY_SELECT } } },
        },
      }),
    ]);
    if (invoices.length > MAX_EXPORT_ROWS || payments.length > MAX_EXPORT_ROWS) {
      return NextResponse.json(
        { error: `Trop de lignes : réduisez la période (${formatDecimal(MAX_EXPORT_ROWS, 0)} maximum par feuille).` },
        { status: 400 }
      );
    }

    const sales = salesJournalRows(
      invoices.map((invoice) => ({
        ...invoice,
        // Kept by the query (`issuedAt` not null or in the period).
        issuedAt: invoice.issuedAt as Date,
        client: invoiceClientIdentity(invoice),
        payments: invoice.payments.map((payment) => payment.amount),
        creditNotes: invoice.creditNotes.map((note) => note.total),
      }))
    );
    const totals = salesJournalTotals(sales);
    const settlements = settlementRows(
      payments.map((payment) => ({
        ...payment,
        invoice: { number: payment.invoice.number, client: invoiceClientIdentity(payment.invoice) },
      }))
    );
    const now = new Date();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Qualilab";

    const journal = workbook.addWorksheet("Journal des ventes");
    // The columns are `salesJournalColumns` (ICE, IF and RC after the client, H2).
    journal.columns = salesJournalColumns(formatDayShort(now)).map(({ header, key, width, format }) => ({
      header,
      key,
      width,
      ...(format ? { style: { numFmt: format === "day" ? DAY : MONEY } } : {}),
    }));
    for (const row of sales) {
      journal.addRow({ ...row, cancelled: row.cancelled ? "Oui" : "Non", remaining: row.remaining ?? "" });
    }
    const journalTotal = journal.addRow({
      client: totals.cancelledCount > 0 ? "Total (hors factures annulées)" : "Total",
      ht: totals.ht,
      tva: totals.tva,
      ttc: totals.ttc,
      remaining: totals.remaining,
    });
    journalTotal.font = { bold: true };
    journal.getRow(1).font = { bold: true };
    journal.views = [{ state: "frozen", ySplit: 1 }];

    const received = workbook.addWorksheet("Règlements");
    received.columns = [
      { header: "Date", key: "day", width: 12, style: { numFmt: DAY } },
      { header: "Facture", key: "invoice", width: 16 },
      { header: "Client", key: "client", width: 32 },
      { header: "Mode", key: "mode", width: 12 },
      { header: "Montant", key: "amount", width: 14, style: { numFmt: MONEY } },
      { header: "Référence", key: "reference", width: 24 },
    ];
    for (const row of settlements) received.addRow(row);
    const receivedTotal = received.addRow({ client: "Total", amount: settlementsTotal(settlements) });
    receivedTotal.font = { bold: true };
    received.getRow(1).font = { bold: true };
    received.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = salesJournalFileName(period.fromDay, period.toDay, formatIsoDay(now));

    await logAudit({
      actorId: session.id,
      action: "INVOICES_EXPORTED",
      entity: "Invoice",
      metadata: { du: period.fromDay, au: period.toDay, rows: sales.length, settlements: settlements.length },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[invoices/export] failed", error);
    return NextResponse.json({ error: "L'export n'a pas pu être généré. Réessayez." }, { status: 500 });
  }
}
