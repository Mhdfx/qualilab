import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDecimal } from "@/lib/labels";
import { labDayOf } from "@/lib/lab-time";
import { loadAchatSettings } from "@/lib/achat-settings";
import { PURCHASE_INVOICE_INCLUDE, invoiceCertificate } from "@/lib/purchase-invoices-server";
import {
  LAB_PURCHASE_COLUMNS,
  MAX_PURCHASE_EXPORT_ROWS,
  PURCHASE_JOURNAL_COLUMNS,
  purchaseJournalFileName,
  purchaseJournalRows,
  purchaseJournalTotals,
  purchasePaymentRows,
  purchasePaymentsTotal,
  purchasePeriod,
  withholdingRows,
  withholdingTotal,
} from "@/lib/purchase-journal";

/**
 * Le « Journal des achats » en Excel (lot 3D, RETOUR-LABO-28-10.md M2, M7):
 * `?mois=AAAA-MM`, `?annee=AAAA` or `?du=&au=` (the invoice's day), nothing
 * = every invoice. Three sheets — the journal in the laboratory's 13
 * columns then ours, with an automatic filter and a totals row; the état
 * des retenues à la source; the payments of the period. The rows are
 * `lib/purchase-journal.ts`. Cancelled entries are not exported. Audited.
 */

const MONEY = "#,##0.00";
const RATE = "0.##";
const DAY = "dd/mm/yyyy";

const numFmt = (format?: "day" | "money" | "rate") =>
  format ? { style: { numFmt: format === "day" ? DAY : format === "money" ? MONEY : RATE } } : {};

export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const parsed = purchasePeriod({
    mois: params.get("mois"),
    annee: params.get("annee"),
    du: params.get("du"),
    au: params.get("au"),
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { period } = parsed;
  const range =
    period.from || period.until
      ? { ...(period.from ? { gte: period.from } : {}), ...(period.until ? { lt: period.until } : {}) }
      : undefined;

  try {
    const settings = await loadAchatSettings();
    const months = settings.withholding.certificateValidityMonths;
    const [invoices, payments] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: { status: { not: "ANNULEE" }, ...(range ? { issueDate: range } : {}) },
        orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
        take: MAX_PURCHASE_EXPORT_ROWS + 1,
        include: PURCHASE_INVOICE_INCLUDE,
      }),
      prisma.purchasePayment.findMany({
        where: { invoice: { status: { not: "ANNULEE" } }, ...(range ? { paidOn: range } : {}) },
        orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
        take: MAX_PURCHASE_EXPORT_ROWS + 1,
        select: {
          paidOn: true,
          amount: true,
          method: true,
          reference: true,
          invoice: { select: { number: true, supplier: { select: { name: true } } } },
        },
      }),
    ]);
    if (invoices.length > MAX_PURCHASE_EXPORT_ROWS || payments.length > MAX_PURCHASE_EXPORT_ROWS) {
      return NextResponse.json(
        { error: `Trop de lignes : réduisez la période (${formatDecimal(MAX_PURCHASE_EXPORT_ROWS, 0)} maximum par feuille).` },
        { status: 400 }
      );
    }

    const now = new Date();
    const journalInput = invoices.map((invoice) => ({ ...invoice, certificate: invoiceCertificate(invoice, months) }));
    const rows = purchaseJournalRows(journalInput, { now, labDay: labDayOf });
    const totals = purchaseJournalTotals(rows);
    const retenues = withholdingRows(journalInput, settings.withholding.base);
    const paymentRows = purchasePaymentRows(payments);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Qualilab";

    const journal = workbook.addWorksheet("Journal des achats");
    journal.columns = PURCHASE_JOURNAL_COLUMNS.map(({ header, key, width, format }) => ({ header, key, width, ...numFmt(format) }));
    for (const row of rows) journal.addRow(row);
    const total = journal.addRow({
      supplier: totals.ttcOnly > 0 ? `Total (${totals.ttcOnly} facture${totals.ttcOnly > 1 ? "s" : ""} sans HT)` : "Total",
      ht: totals.ht,
      tva: totals.tva,
      ttc: totals.ttc,
      euro: totals.euro || null,
      withholding: totals.withholding,
      net: totals.net,
      paid: totals.paid,
      remaining: totals.remaining,
    });
    total.font = { bold: true };
    journal.getRow(1).font = { bold: true };
    journal.views = [{ state: "frozen", ySplit: 1 }];
    // Their template's filter, on their 13 columns and ours.
    journal.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: PURCHASE_JOURNAL_COLUMNS.length } };
    // Their 13 columns stand apart from ours.
    journal.getRow(1).eachCell((cell, column) => {
      if (column > LAB_PURCHASE_COLUMNS.length) cell.font = { bold: true, italic: true };
    });

    const withheld = workbook.addWorksheet("Retenues à la source");
    withheld.columns = [
      { header: "Fournisseur", key: "supplier", width: 30 },
      { header: "ICE", key: "ice", width: 18 },
      { header: "N° Facture", key: "number", width: 16 },
      { header: "Date", key: "day", width: 12, style: { numFmt: DAY } },
      { header: "Base", key: "base", width: 18 },
      { header: "Montant de la base", key: "baseAmount", width: 16, style: { numFmt: MONEY } },
      { header: "Taux (%)", key: "rate", width: 10, style: { numFmt: RATE } },
      { header: "Retenue", key: "amount", width: 14, style: { numFmt: MONEY } },
      { header: "Attestation fiscale", key: "certificate", width: 20 },
    ];
    for (const row of retenues) withheld.addRow(row);
    const withheldTotal = withheld.addRow({ supplier: "Total", amount: withholdingTotal(retenues) });
    withheldTotal.font = { bold: true };
    withheld.getRow(1).font = { bold: true };
    withheld.views = [{ state: "frozen", ySplit: 1 }];

    const paid = workbook.addWorksheet("Paiements");
    paid.columns = [
      { header: "Date", key: "day", width: 12, style: { numFmt: DAY } },
      { header: "Fournisseur", key: "supplier", width: 30 },
      { header: "N° Facture", key: "number", width: 16 },
      { header: "Mode", key: "method", width: 12 },
      { header: "Montant", key: "amount", width: 14, style: { numFmt: MONEY } },
      { header: "Référence", key: "reference", width: 24 },
    ];
    for (const row of paymentRows) paid.addRow(row);
    const paidTotal = paid.addRow({ supplier: "Total", amount: purchasePaymentsTotal(paymentRows) });
    paidTotal.font = { bold: true };
    paid.getRow(1).font = { bold: true };
    paid.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = purchaseJournalFileName(period, labDayOf(now));

    await logAudit({
      actorId: session.id,
      action: "PURCHASE_JOURNAL_EXPORTED",
      entity: "PurchaseInvoice",
      metadata: { periode: period.slug, rows: rows.length, retenues: retenues.length, payments: paymentRows.length },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[purchase-invoices/export] failed", error);
    return NextResponse.json({ error: "L'export n'a pas pu être généré. Réessayez." }, { status: 500 });
  }
}
